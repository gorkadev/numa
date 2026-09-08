import { googleVertex } from "@ai-sdk/google-vertex"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { streamText } from "ai"

import { loadGameThread, saveGameThread } from "@/lib/games/thread"

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
   * The database stays the source of truth for history: this loads the stored
   * thread on every turn and ignores the browser's copy, except for the new
   * message, which arrives in `incomingMessages` already validated.
   *
   * `upsertIncomingMessage` appends that message and reports whether anything
   * changed, so the write is skipped on the turns that carry no new user
   * message. Writing here — before the model streams — is what makes a refresh
   * mid-answer still find the question in the thread.
   */
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const stored = await loadGameThread(chatId)

    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      await saveGameThread({ gameId: chatId, messages: stored })
    }

    return stored
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
  }) => {
    await saveGameThread({
      gameId: chatId,
      messages: uiMessages,
      chatAccessToken,
      lastEventId,
    })
  },

  run: async ({ messages, signal }) =>
    streamText({
      /**
       * Spread first, so every explicit option below still wins. This is what
       * wires up the `prepareStep` callback behind compaction, mid-turn
       * steering and background injection — omitting it throws no error, those
       * features simply never run.
       */
      ...chat.toStreamTextOptions(),
      model: googleVertex("gemini-3.8-flash"),
      messages,
      /**
       * Fires on stop and on cancel. Without it, stopping updates the browser
       * while the model keeps generating server-side.
       */
      abortSignal: signal,
    }),
})
