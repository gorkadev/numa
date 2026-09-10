import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import {
  getToolName,
  isToolUIPart,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { gameModelSettings } from "@/lib/ai/agent"
import { withThreadModel } from "@/lib/ai/message-model"
import { gameModelIdSchema } from "@/lib/ai/model-catalog"
import { createGameSandbox } from "@/lib/daytona/utils"
import { gameInstructions } from "@/lib/games/instructions"
import { gameRevisionChunk } from "@/lib/games/revision"
import { loadGameThread, saveGameThread } from "@/lib/games/thread"
import { createGameTools } from "@/lib/games/tools"

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
   * The model the player picked, validated against the closed set in the
   * catalog. The id crosses from the browser, so an unrecognised one is
   * rejected here rather than handed to the provider.
   *
   * Everything is optional, and the object itself defaults to empty: the turn
   * of a client that sends no choice at all — an older tab, or the app before
   * a picker exists — has to remain answerable, and `gameModelSettings` fills
   * in the default.
   */
  clientDataSchema: z
    .object({ model: gameModelIdSchema.optional() })
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
      messages: withThreadModel(uiMessages, clientData?.model),
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
  onBeforeTurnComplete: async ({ responseMessage, writer }) => {
    if (!changedGameFiles(responseMessage)) return

    writer.write(gameRevisionChunk(Date.now()))
  },

  /**
   * Persists the finished turn: the full thread plus the cursor the transport
   * resubscribes from. One statement, so a reload can never land between the
   * two and replay the assistant's reply.
   */
  onTurnComplete: async ({
    chatId,
    uiMessages,
    chatAccessToken,
    lastEventId,
    clientData,
  }) => {
    await saveGameThread({
      gameId: chatId,
      messages: withThreadModel(uiMessages, clientData?.model),
      chatAccessToken,
      lastEventId,
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
       * that arrived, so switching models continues the same thread rather
       * than starting a second one.
       */
      ...gameModelSettings(clientData?.model),
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
