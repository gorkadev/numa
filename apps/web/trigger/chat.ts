import { logger } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import {
  getToolName,
  isToolUIPart,
  stepCountIs,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { orchestratorModelSettings } from "@/lib/ai/agent"
import { withTurnMeta } from "@/lib/ai/message-meta"
import { withThreadTier } from "@/lib/ai/message-model"
import { tierIdSchema } from "@/lib/ai/model-catalog"
import {
  resolveModel,
  resolveTier,
  type FallbackHooks,
  type ModelEntryId,
} from "@/lib/ai/model-registry"
import { priceTurn } from "@/lib/ai/pricing"
import { createGameSandbox } from "@/lib/daytona/utils"
import { HARNESS_PHASES } from "@/lib/games/harness/flags"
import { createExploreTool } from "@/lib/games/harness/tools/explore"
import { createRunTasksTool } from "@/lib/games/harness/tools/run-tasks"
import { turnState } from "@/lib/games/harness/turn-state"
import { gameInstructions } from "@/lib/games/instructions"
import { gameRevisionChunk } from "@/lib/games/revision"
import { loadGameThread, saveGameThread } from "@/lib/games/thread"
import { createGameTools } from "@/lib/games/tools"
import { turnCreditsChunk } from "@/lib/games/turn-credits"
import { getGameOrgId, recordTurnUsage } from "@/lib/games/usage"
import { getCreditBalance } from "@/lib/polar/balance"

/**
 * How long past a turn's start `chat.local`'s `deadline` gives every dispatch
 * tool (unit 2a onward) before it must wrap up — under `trigger.config.ts`'s
 * `maxDuration: 3600`, so the run itself is never the thing that cuts a phase
 * short.
 */
const TURN_DEADLINE_MS = 3300_000

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
 * The part of `run_tasks`' stored result this check reads. Read structurally
 * rather than trusted as `RunTasksResult`: the output comes back from
 * persisted history, so its shape is only as good as whatever wrote it.
 */
type RunTasksOutput = { outcomes?: { wroteFiles?: unknown }[] }

/** Whether a finished `run_tasks` call wrote, edited or deleted a file. */
function runTasksWroteFiles(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return false

  const outcomes = (output as RunTasksOutput).outcomes

  return Array.isArray(outcomes) && outcomes.some((outcome) => outcome.wroteFiles === true)
}

/**
 * Whether this turn actually wrote to the sandbox.
 *
 * The subtle half is what counts as success. The file tools report their
 * failures as an `{ error }` result rather than throwing, so the model can
 * correct itself without the turn dying — which means a rejected path and a
 * completed write arrive in the same `output-available` state. Trusting the
 * state alone would reload the preview after a turn that changed nothing.
 *
 * `run_tasks` (unit 3) never appears as a raw `write_file`/`replace_text`/
 * `delete_file` part on the orchestrator's own message — those calls happen
 * inside a dispatched worker's own stream, not the orchestrator's — so its
 * tool part is checked separately, through its own stored result shape
 * (`RunTasksOutput` above) rather than `MUTATING_TOOLS`.
 */
function changedGameFiles(message: UIMessage | undefined): boolean {
  if (!message) return false

  return message.parts.some((part) => {
    if (!isToolUIPart(part)) return false
    if (part.state !== "output-available") return false

    const name = getToolName(part)

    if (MUTATING_TOOLS.has(name)) {
      const output = part.output

      return typeof output !== "object" || output === null || !("error" in output)
    }

    if (name === "run_tasks") {
      return runTasksWroteFiles(part.output)
    }

    return false
  })
}

/**
 * Dispatch tools gated behind `HARNESS_PHASES` (unit 2a/2b's `flags.ts`).
 *
 * Decision 6 in design.md: every tool, dispatch tools included, stays
 * declared on `chat.agent({ tools })` regardless of the flag, so a stored
 * `explore`/`run_tasks` tool-call part keeps re-converting correctly even on
 * a turn that ran with the flag off. Only `activeTools` — which candidate
 * this turn's model may actually call — changes with the flag. `explore`
 * (unit 2b) and `run_tasks` (unit 3) are wired in today; later phase tools
 * (`plan`, `verify`, `load_skill`) add themselves here as their own units
 * wire them in.
 */
const PHASE_TOOLS = new Set(["explore", "run_tasks"])

/**
 * Every declared tool name, minus the phase tools, unless `HARNESS_PHASES` is
 * on. Reads the tool set's own keys rather than a hand-maintained allow-list,
 * so a tool that is not a phase tool never has to be added here to stay
 * callable.
 */
function activeToolNames<T extends ToolSet>(tools: T): (keyof T & string)[] {
  return Object.keys(tools).filter(
    (name) => HARNESS_PHASES || !PHASE_TOOLS.has(name)
  ) as (keyof T & string)[]
}

/**
 * Wires the orchestrator's `strong` slot to `turnState` (decision 19, unit
 * 1c): `lib/ai` cannot import `turnState` itself (see `resolveModel`'s note
 * in `model-registry.ts`), so this is the one object, built here, that lets
 * the composite `orchestratorModelSettings` returns skip an entry a previous
 * step already ruled out this turn, and report back which entry actually
 * served the latest call.
 */
const orchestratorHooks: FallbackHooks = {
  isUnavailable: (id) => turnState.isUnavailable(id),
  markUnavailable: (id) => turnState.markUnavailable(id),
  onServed: (served) => turnState.recordServed("strong", served),
}

/**
 * The concrete registry entry the orchestrator ran this turn on — the tier's
 * `strong` slot, resolved through the same functions `orchestratorModelSettings`
 * itself calls (decision 18), but preferring whatever `orchestratorHooks`
 * actually recorded as having served a call this turn (decision 19): a slot
 * fallback can mean the entry that ran is a peer of the configured primary,
 * not the primary itself. The credits chunk, the persisted message and the
 * cost ledger all name this exact id, so the entry that is billed can never
 * drift from the entry that actually ran.
 *
 * Falls back to `resolveModel(...).primary.id` only for a turn whose
 * orchestrator never actually made a model call — nothing was ever recorded
 * as served, so the tier's configured primary is the closest honest answer.
 *
 * Reads `turnState.tier` rather than re-deriving it from `clientData`: both
 * `onBeforeTurnComplete` and `onTurnComplete` fire after `onTurnStart` has
 * already called `turnState.reset` with `resolveTier(clientData?.tier)`, so
 * this is the same value `orchestratorModelSettings` used to pick the model
 * that actually ran — and the single value every dispatched sub-agent's
 * `resolveModel(turnState.tier, role.slot)` will read from unit 2a onward.
 *
 * KNOWN LIMITATION: `turnState.servedFor("strong")` keeps only the LAST
 * entry that served a call on this slot, so a turn whose steps were split
 * between the primary (steps 1-2, say) and a peer that took over after a
 * mid-turn failure (steps 3+) prices the WHOLE turn's orchestrator usage at
 * the last server's rate, not a per-step split. This cannot happen yet —
 * every tier profile holds exactly one candidate per slot, so there is
 * nothing to fail over to mid-turn — but it is a real gap the moment a
 * second candidate is added. Per-call attribution is deferred to unit 2a's
 * `run-subagent.ts`, which will record one `AgentUsageEntry` per step (or per
 * dispatched run) rather than one per turn, making this limitation moot for
 * every role that goes through it; fixing it for the orchestrator's own
 * single whole-turn `usage` specifically would need `onStepEnd`-level
 * granularity this file does not have today.
 */
function orchestratorEntryId(): ModelEntryId {
  return (
    turnState.servedFor("strong")?.entryId ??
    resolveModel(turnState.tier, "strong").primary.id
  )
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
   * Initializes `chat.local`'s per-turn usage ledger.
   *
   * `onBoot` rather than `onChatStart`, on purpose: it fires on every fresh
   * worker — including a continuation run after a cancel, crash or upgrade —
   * while `onChatStart` fires only once, on the chat's very first message.
   * Initializing here only would leave every continuation run's first access
   * to `turnState` throwing "can only be modified after initialization".
   *
   * The values written here never survive to be read: `onTurnStart` below
   * calls `turnState.reset` before `run()` or either completion hook can see
   * them, on every turn including the first.
   */
  onBoot: async () => {
    turnState.init()
  },

  /**
   * The file tools plus every dispatch tool, resolved per turn so they close
   * over this chat's game. `explore` (unit 2b) and `run_tasks` (unit 3) are
   * the dispatch tools declared so far; `activeTools` in `run` below is what
   * actually keeps them out of a turn while `HARNESS_PHASES` is off, not
   * this declaration.
   *
   * Declared here and not only on `streamText`, because this is the set the
   * SDK re-converts stored history against on every later turn. A tool known
   * only to `streamText` would work on the turn that called it and then lose
   * its result formatting the moment the thread was replayed.
   */
  tools: ({ chatId }) => ({
    ...createGameTools(chatId),
    explore: createExploreTool(chatId),
    run_tasks: createRunTasksTool(chatId),
  }),

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
  onTurnStart: async ({ chatId, uiMessages, clientData, turn }) => {
    /**
     * Resets the ledger for this turn, so it never inherits a prior turn's
     * usage — and resolves the tier once, through the same `resolveTier` the
     * provider and the ledger both key off, so every later read of
     * `turnState.tier` this turn agrees with what actually ran.
     */
    turnState.reset(turn, Date.now() + TURN_DEADLINE_MS, resolveTier(clientData?.tier))

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
    turn,
    stopped,
    error,
  }) => {
    /**
     * What the turn cost, sent before the balance in Polar has moved.
     *
     * This is the only hook that has both the numbers and a way out: `usage`
     * is the orchestrator's own whole-turn token total, and `writer` is a
     * stream that `onTurnComplete` no longer has. The entry is appended to
     * `turnState`'s ledger here, once, so `onTurnComplete` below reads the
     * same ledger back rather than adding a second entry for the same run.
     *
     * `priceTurn` is what both this chunk and the ledger price from — see
     * `turn-usage-accounting`'s Credits Chunk Reflects the Full Turn
     * requirement — so the number the user watches leave their balance can
     * never drift from the number they are actually charged.
     *
     * `ledgerFor(turn)` rather than the bare ledger: this hook never actually
     * fires on the stale-ledger path `ledgerFor` guards against — the SDK
     * only calls `onTurnComplete` when a turn fails before `onTurnStart` —
     * but reading it the same way both completion hooks do means neither can
     * silently start trusting an unscoped ledger later.
     *
     * Ahead of the reload signal, and outside its early return: a turn that
     * only answered a question changed no files but still spent credits.
     * Ordering it first also means the deduction reaches the sidebar before
     * the preview starts remounting an iframe.
     */
    if (usage) {
      turnState.addUsage({
        agentId: "orchestrator",
        role: "orchestrator",
        slot: "strong",
        modelId: orchestratorEntryId(),
        usage,
        status: error ? "error" : stopped ? "aborted" : "done",
      })

      writer.write(
        turnCreditsChunk(priceTurn(turnState.tier, turnState.ledgerFor(turn)))
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
    turn,
    runId,
    finishReason,
    stopped,
  }) => {
    const modelId = orchestratorEntryId()

    /**
     * The FULL turn's price — the orchestrator's entry `onBeforeTurnComplete`
     * already appended, plus every sub-agent entry a dispatch tool added
     * during the turn (none yet; unit 2a is what starts populating this) —
     * summed once by `priceTurn`. Recomputing it here rather than threading a
     * value between the two hooks is safe and cheap: `priceTurn` is a pure
     * function of the ledger, and that ledger does not change between
     * `onBeforeTurnComplete` and here — nothing runs in between.
     *
     * `ledgerFor(turn)` rather than the bare ledger, and this is the hook
     * where it matters: `onValidateMessages` and `hydrateMessages` run BEFORE
     * `onTurnStart`, inside the same try the SDK wraps the whole turn in — if
     * either throws (the credit gate in `onValidateMessages`, for one),
     * `onTurnStart` never resets `turnState` for this turn, `onBeforeTurnComplete`
     * never fires, but `onTurnComplete` still does, with `usage: undefined`
     * and this same `turn` number. Without the turn check, `turnState` would
     * still hold the PREVIOUS turn's ledger, and this call would re-price and
     * re-bill it a second time.
     */
    const cost = priceTurn(turnState.tier, turnState.ledgerFor(turn))

    /**
     * The reply is stored carrying what it cost. `withTurnMeta` is the durable
     * counterpart to the transient `data-turn-credits` part written in
     * `onBeforeTurnComplete`: the same numbers, kept on the message instead of
     * spent on the sidebar, so the thread can still answer "what did this turn
     * take?" after a reload. See `lib/ai/message-meta.ts`.
     */
    await saveGameThread({
      gameId: chatId,
      messages: withTurnMeta(withThreadTier(uiMessages, clientData?.tier), cost),
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
     *
     * `cost` carries the full-turn total AND the per-agent breakdown — see
     * `turn-usage-accounting`'s Ledger and Polar Reflect the Full Turn, and
     * Per-Sub-Agent Usage Breakdown Retained, requirements.
     */
    await recordTurnUsage({
      gameId: chatId,
      modelId,
      turn,
      runId,
      cost,
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
       * the tier's `strong` slot (decisions 2 and 18); `orchestratorHooks`
       * lets that call fall back to a peer entry and remember it for the
       * rest of the turn (decision 19).
       *
       * Spread AFTER `chat.toStreamTextOptions()` (confirmed: that call sets
       * no `maxRetries` of its own, so there is nothing for this to lose to),
       * because `orchestratorModelSettings` also returns `maxRetries: 0` —
       * `resolveModel`'s composite now owns retrying a candidate's own
       * retryable failures itself, so `ai`'s own default retry must not also
       * retry the whole composite call on top of that.
       */
      ...orchestratorModelSettings(clientData?.tier, orchestratorHooks),
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
      /**
       * Narrows the declared tool set down to what this turn's model may
       * actually call. `explore` is excluded while `HARNESS_PHASES` is off
       * (still the case here), which is what keeps unit 2a/2b's runner inert
       * on every real turn until unit 8 flips the flag — the declaration
       * above never changes.
       */
      activeTools: activeToolNames(tools),
    }),
})
