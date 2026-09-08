import { googleVertex } from "@ai-sdk/google-vertex"
import { auth } from "@clerk/nextjs/server"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai"

import { loadGameThread, saveGameThread } from "@/lib/games/thread"

/**
 * One game owns one chat, so the chat id `useChat` sends is the game id. The
 * database — not the browser — holds the thread: this handler loads the
 * persisted history, appends the single new message the client posted, and
 * writes the whole thread back when the turn ends. Client-held history is never
 * trusted as model input.
 *
 * `auth.protect()` answers a signed-out request with a 404 HTML page, which a
 * fetch-based client cannot interpret. An explicit 401 is what `useChat`
 * surfaces as an error.
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth()

  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  /**
   * A user with no active organization owns no games, so there is no thread to
   * scope this request to.
   */
  if (!orgId) {
    return new Response("Forbidden", { status: 403 })
  }

  const { id, message }: { id?: string; message?: UIMessage } = await req.json()

  if (!id || !message) {
    return new Response("Bad Request", { status: 400 })
  }

  const persisted = await loadGameThread({ gameId: id, orgId })

  if (!persisted) {
    return new Response("Not Found", { status: 404 })
  }

  /**
   * The new message crosses the network from the client, so it is validated
   * alongside the loaded history rather than appended blindly.
   */
  const messages = await validateUIMessages({
    messages: [...persisted, message],
  })

  const result = streamText({
    model: googleVertex("gemini-3.8-flash"),
    messages: await convertToModelMessages(messages),
  })

  /**
   * Removes the backpressure that would otherwise abort the model call when the
   * browser tab closes mid-stream, so `onEnd` still fires and the answer is
   * persisted. Deliberately not awaited.
   */
  result.consumeStream()

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      /**
       * `originalMessages` is what lets `onEnd` hand back the complete thread —
       * history plus the assistant's reply — instead of only the new parts.
       */
      originalMessages: messages,
      /**
       * Without this the response message is persisted with no id at all: the
       * stream only carries one when it is asked to generate it. React then
       * renders every reloaded assistant message under the same `undefined`
       * key.
       */
      generateMessageId: generateId,
      onEnd: ({ messages }) => saveGameThread({ gameId: id, orgId, messages }),
    }),
  })
}
