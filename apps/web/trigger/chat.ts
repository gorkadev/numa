import { logger } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import {
  getToolName,
  isToolUIPart,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { orchestratorModelSettings } from "@/lib/ai/agent"
import { withTurnMeta } from "@/lib/ai/message-meta"
import { withThreadTier } from "@/lib/ai/message-model"
import { tierIdSchema, type TierId } from "@/lib/ai/model-catalog"
import {
  resolveModel,
  resolveTier,
  type ModelEntryId,
} from "@/lib/ai/model-registry"
import { turnCreditCost } from "@/lib/ai/pricing"
import { createGameSandbox } from "@/lib/daytona/utils"
import { gameInstructions } from "@/lib/games/instructions"
import { gameRevisionChunk } from "@/lib/games/revision"
import { loadGameThread, saveGameThread } from "@/lib/games/thread"
import { createGameTools } from "@/lib/games/tools"
import { turnCreditsChunk } from "@/lib/games/turn-credits"
import { getGameOrgId, recordTurnUsage } from "@/lib/games/usage"
import { getCreditBalance } from "@/lib/polar/balance"

/**
 * The tools that change what the player would see.
 *
 * `read_file` and `list_files` are deliberately absent: a turn that only looked
 * at the game left the preview correct, and remounting the iframe anyway would
 * restart a running game — losing the player's position to redraw the same
 * bytes.
 */
const MUTATING_TOOLS = new Set(["write_file", "replace_text", "delete_file"])

/**
 * Whether this turn actually wrote to the sandbox.
 *
 * The subtle half is what counts as success. The file tools report their
 * failures as an `{ error }` result rather than throwing, so the model can
 * correct itself without the turn dying — which means a rejected path and a
 * completed write arrive in the same `output-available` state. Trusting the
 * state alone would reload the preview after a turn that changed nothing.
 */
function changedGameFiles(message: UIMessage | undefined): boolean {
  if (!message) return false

  return message.parts.some((part) => {
    if (!isToolUIPart(part)) return false
    if (!MUTATING_TOOLS.has(getToolName(part))) return false
    if (part.state !== "output-available") return false

    const output = part.output

    return typeof output !== "object" || output === null || !("error" in output)
  })
}

/**
 * The concrete registry entry the orchestrator runs this turn on — the tier's
 * `strong` slot, resolved through the same two functions
 * `orchestratorModelSettings` itself calls (decision 18). The credits chunk,
 * the persisted message and the cost ledger all name this exact id, so the
 * entry that is billed can never drift from the entry that actually ran.
 */
function orchestratorEntryId(tier: TierId | undefined): ModelEntryId {
  return resolveModel(resolveTier(tier), "strong").primary.id
}

/**
 * The stream part that tells the browser a turn was refused for credits.
 *
 * A `data-*` part rather than the thrown error's message, for the same reason
 * `lib/games/revision.ts` uses one: this is a notification about the account,
 * not something anybody wants replayed as conversation. `transient` keeps it
 * out of the response message — which in this case would not exist anyway,
 * since the turn is about to be aborted.
 *
 * `balance` is `number | null`, and the null is load-bearing. An exhausted
 * organization has a real number to show, and that number can be NEGATIVE:
 * metering is asynchronous and eventually consistent, so a turn that started
 * with credits can finish having spent past zero. `null` is the unprovisioned
 * case — there is no Polar customer, therefore no meter, therefore no number to
 * quote. A UI that printed `0` for both would tell somebody who never had an
 * account that they had spent everything.
 *
 * It is written through `chat.response.write` rather than a hook's `writer`
 * because `onValidateMessages` does not receive one: its event is
 * `{ messages, chatId, turn, trigger }` and nothing else. `chat.response.write`
 * reaches the same run-scoped output stream from anywhere inside the run, which
 * is exactly what a hook with no writer needs.
 */
function writeCreditsExhausted(balance: number | null): void {
  chat.response.write({
    type: "data-credits-exhausted",
    data: { balance },
    transient: true,
  })
}

/**
 * One game owns one chat, so the chat id is the game id.
 *
 * The whole conversation is a single long-lived task run: it wakes when a
 * message arrives and freezes when none does, which is why there is no route
 * handler, no `convertToModelMessages` call, and no stream-resumption plumbing
 * left in this application. `run` receives `ModelMessage[]` already converted,
 * and returning the `StreamTextResult` pipes it to the browser.
 */
export const gameChat = chat.agent({
  id: "game-chat",

  /**
   * The tier the player picked, validated against the closed set in the
   * catalog. The id crosses from the browser, so an unrecognised one is
   * rejected here rather than resolved to a model — the schema decides what is
   * *allowed*.
   *
   * Everything is optional, and the object itself defaults to empty: the turn
   * of a client that sends no choice at all — an older tab, or the app before
   * a picker exists — has to remain answerable, and `resolveTier` fills in the
   * default.
   */
  clientDataSchema: z
    .object({ tier: tierIdSchema.optional() })
    .default({}),

  /**
   * The file tools, resolved per turn so they close over this chat's game.
   *
   * Declared here and not only on `streamText`, because this is the set the
   * SDK re-converts stored history against on every later turn. A tool known
   * only to `streamText` would work on the turn that called it and then lose
   * its result formatting the moment the thread was replayed.
   */
  tools: ({ chatId }) => createGameTools(chatId),

  /**
   * Refuses a turn the organization has no credits for.
   *
   * This is the first hook of the per-turn lifecycle — it runs before
   * `hydrateMessages`, before `onChatStart` and before `onTurnStart` — and
   * throwing from it aborts the turn. That position is worth more than it
   * looks: a refusal on a game's very first message happens BEFORE
   * `onChatStart`, so no Daytona sandbox is minted for a turn that will never
   * run. Gating any later would pay for the compute and then decline to use it.
   *
   * `chatId` is the game id, and the organization is read out of the game row
   * because there is nothing else to read it from — this task has no Clerk
   * request context, which is the same reason `lib/games/thread.ts` and
   * `lib/games/usage.ts` work the way they do.
   *
   * # Why an unreadable balance lets the turn through
   *
   * This is the contentious decision in the whole feature, so it is written
   * down rather than left to be rediscovered from behaviour.
   *
   * A balance of zero is an ANSWER. Polar was asked, Polar replied, the
   * organization has spent what it was granted. Acting on it is enforcement,
   * and enforcement is the point of the feature.
   *
   * `"unavailable"` is not an answer. It means the question could not be asked:
   * Polar was down, the network failed, the token was wrong. The organization
   * behind it might have zero credits or ten thousand, and this code has no way
   * to tell. Refusing on it converts every wobble at the billing vendor into a
   * total outage of the product for everybody, including the customers who have
   * paid — the failure mode where a dependency that only decides whether you
   * MAY work ends up deciding whether you work at all.
   *
   * So: fail closed on facts, fail open on ignorance. `"unprovisioned"` is a
   * fact and is enforced — an organization with no Polar customer holds no
   * entitlement, and letting it through would make provisioning optional and
   * therefore pointless.
   *
   * That trade is right at these amounts and only at these amounts. A turn is
   * worth cents, an outage is worth the product, and the arithmetic is not
   * close. It stops being right the moment a single turn is expensive enough
   * that a determined abuser can profit from making this call fail — at which
   * point the answer is not to flip this branch to a refusal, it is to stop
   * depending on a synchronous read of somebody else's eventually-consistent
   * counter. See the reservation note in `lib/polar/balance.ts`.
   *
   * # What this does not do
   *
   * It does not prevent an overdraft. The meter lags four to ten seconds behind
   * ingestion, so two tabs starting turns at once both read the same
   * pre-spend balance and both run. This bounds the loss to roughly one round
   * of concurrent turns; it does not eliminate it, and it was never going to.
   */
  onValidateMessages: async ({ messages, chatId }) => {
    const orgId = await getGameOrgId(chatId)

    /**
     * No game row means no tenant, which means nothing to charge this turn to
     * and nothing `recordTurnUsage` could attribute it to afterwards. It is a
     * fact rather than an unknown — the row is gone — so it is refused.
     */
    if (!orgId) {
      writeCreditsExhausted(null)

      throw new Error("This game no longer exists")
    }

    const credits = await getCreditBalance(orgId)

    if (credits.status === "unavailable") {
      logger.warn("Credit balance unavailable, allowing turn", {
        chatId,
        orgId,
      })

      return messages
    }

    if (credits.status === "unprovisioned") {
      writeCreditsExhausted(null)

      throw new Error("Out of credits")
    }

    if (credits.balance <= 0) {
      writeCreditsExhausted(credits.balance)

      throw new Error("Out of credits")
    }

    return messages
  },

  /**
   * Gives the game its sandbox, exactly once. This hook fires on the chat's
   * very first user message and never on a continuation run, so it is the one
   * place a per-chat resource can be minted without a guard.
   *
   * It runs before `hydrateMessages`, so the sandbox is in place before the
   * model answers anything — the game has somewhere to be written from the
   * first turn.
   */
  onChatStart: async ({ chatId }) => {
    await createGameSandbox(chatId)
  },

  /**
   * The database stays the source of truth for history: this loads the stored
   * thread on every turn and ignores the browser's copy, except for the new
   * message, which arrives in `incomingMessages` already validated.
   *
   * Nothing is written here, deliberately. `upsertIncomingMessage` appends a
   * genuinely new message and no-ops otherwise — and the turn that answers an
   * `ask_player` question is exactly the no-op case: the browser sends the
   * existing assistant message's id carrying a slim tool-state advance, which
   * the runtime overlays onto the chain only *after* this hook returns. A
   * write from here could therefore never carry the player's answer.
   * `onTurnStart` persists the merged chain instead, which covers both cases
   * in one statement.
   */
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const stored = await loadGameThread(chatId)

    upsertIncomingMessage(stored, { trigger, incomingMessages })

    return stored
  },

  /**
   * Writes the thread down before the model streams a word of the turn.
   *
   * This is the only point where the player's answer to `ask_player` exists in
   * a form worth storing: it arrives as a state advance on a message the row
   * already holds, and the runtime merges it in between `hydrateMessages` and
   * here.
   *
   * Before the turn rather than after it, because the turn it opens is a build
   * that runs for minutes. Until this lands, a reload reads the row back and
   * finds the question unanswered — putting the same choice to the player a
   * second time, on top of a game already being built from their first answer.
   */
  onTurnStart: async ({ chatId, uiMessages, clientData }) => {
    await saveGameThread({
      gameId: chatId,
      messages: withThreadTier(uiMessages, clientData?.tier),
    })
  },

  /**
   * Tells the browser to reload the preview, once the turn's last file write
   * has landed.
   *
   * This hook rather than `onTurnComplete` because the stream is still open
   * here — after it closes there is no channel left to reach the tab on. And
   * the whole turn rather than each write, because the game is only worth
   * looking at between edits: reloading after every `write_file` would show the
   * player a half-applied change, twice.
   *
   * The revision is the payload rather than a bare ping so the signal is
   * idempotent. The sandbox's preview URL never changes, so the browser
   * remounts the frame by key — and receiving the same revision twice, as a
   * resubscribing tab can, then costs a running game nothing.
   */
  onBeforeTurnComplete: async ({
    responseMessage,
    writer,
    usage,
    clientData,
  }) => {
    /**
     * What the turn cost, sent before the balance in Polar has moved.
     *
     * This is the only hook that has both the numbers and a way out: `usage`
     * is the whole turn's token total, and `writer` is a stream that
     * `onTurnComplete` no longer has. Computing it with the same
     * `turnCreditCost` the ledger uses is what guarantees the number the user
     * watches leave their balance is the number they are actually charged —
     * a second formula here would drift from the invoice within a month.
     *
     * Ahead of the reload signal, and outside its early return: a turn that
     * only answered a question changed no files but still spent credits.
     * Ordering it first also means the deduction reaches the sidebar before
     * the preview starts remounting an iframe.
     */
    if (usage) {
      writer.write(
        turnCreditsChunk(
          turnCreditCost({
            modelId: orchestratorEntryId(clientData?.tier),
            usage,
          })
        )
      )
    }

    if (!changedGameFiles(responseMessage)) return

    writer.write(gameRevisionChunk(Date.now()))
  },

  /**
   * Persists the finished turn: the full thread plus the cursor the transport
   * resubscribes from. One statement, so a reload can never land between the
   * two and replay the assistant's reply.
   *
   * The cost ledger is written here too, and after the thread on purpose. The
   * thread is what the player loses if this hook goes wrong; the ledger is an
   * observation about it, so it may never delay or endanger the write it
   * describes — hence second, and behind a `recordTurnUsage` that cannot throw.
   *
   * This is the hook that can measure a turn at all. `usage` here covers the
   * WHOLE turn — every step of the `stepCountIs(25)` loop summed, not just the
   * final answer — and that total is the thing nobody can currently see. Each
   * step re-sends the accumulated context, so a turn's cost grows with the
   * number of steps it took rather than with the length of the reply it
   * produced: a model that read three files, wrote two, and answered in one
   * line is dramatically more expensive than a long reply written in one pass,
   * and the chat looks identical either way.
   */
  onTurnComplete: async ({
    chatId,
    uiMessages,
    chatAccessToken,
    lastEventId,
    clientData,
    usage,
    turn,
    runId,
    finishReason,
    stopped,
  }) => {
    const modelId = orchestratorEntryId(clientData?.tier)

    /**
     * The reply is stored carrying what it cost. `withTurnMeta` is the durable
     * counterpart to the transient `data-turn-credits` part written in
     * `onBeforeTurnComplete`: the same numbers, kept on the message instead of
     * spent on the sidebar, so the thread can still answer "what did this turn
     * take?" after a reload. See `lib/ai/message-meta.ts`.
     */
    await saveGameThread({
      gameId: chatId,
      messages: withTurnMeta(withThreadTier(uiMessages, clientData?.tier), {
        modelId,
        usage,
      }),
      chatAccessToken,
      lastEventId,
    })

    /**
     * `chatId` is the game id.
     *
     * `modelId` is the concrete registry entry the orchestrator's `strong`
     * slot resolved to, computed once above through `orchestratorEntryId` so
     * the ledger can never disagree with what was just persisted on the
     * message. A turn from an older tab sends no tier at all and is still
     * answered on the default tier's `strong` entry; recording that entry
     * rather than `undefined` keeps the cheapest question ("which model is
     * this costing us?") answerable for exactly those turns.
     */
    await recordTurnUsage({
      gameId: chatId,
      modelId,
      turn,
      runId,
      usage,
      finishReason,
      stopped,
    })
  },

  run: async ({ messages, tools, clientData, signal }) =>
    streamText({
      /**
       * Spread first, so every explicit option below still wins. This is what
       * wires up the `prepareStep` callback behind compaction, mid-turn
       * steering and background injection — omitting it throws no error, those
       * features simply never run.
       */
      ...chat.toStreamTextOptions({ tools }),
      /**
       * Resolved per turn, not per chat: the choice is read off the message
       * that arrived, so switching tiers continues the same thread rather
       * than starting a second one. `orchestratorModelSettings` always runs
       * the tier's `strong` slot (decisions 2 and 18).
       */
      ...orchestratorModelSettings(clientData?.tier),
      /**
       * An array of system messages, not a joined string: the provider gets one
       * system block per concern, and each stays independently editable.
       *
       * Set after the spread on purpose. `toStreamTextOptions()` only fills in
       * `system` when `chat.prompt.set()` has been called, which it has not —
       * and `instructions` wins over `system` regardless, so this stays the
       * prompt if a managed one is ever introduced without it being wired here.
       */
      instructions: gameInstructions,
      messages,
      /**
       * Fires on stop and on cancel. Without it, stopping updates the browser
       * while the model keeps generating server-side.
       */
      abortSignal: signal,
      /**
       * A turn is a loop, not a single answer: read the file, edit it, check
       * the result, then reply. Without a stop condition the SDK ends the turn
       * after the first tool call, leaving the model's work unreported and the
       * user reading silence.
       *
       * The ceiling is high enough for a multi-file change and low enough that
       * a model stuck retrying a failing edit gives up rather than burning the
       * turn.
       */
      stopWhen: stepCountIs(25),
    }),
})
