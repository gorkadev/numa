import type { UIMessageChunk } from "ai"

/**
 * The stream with its first chunk already in hand, or `null` when it closed
 * without one.
 *
 * The transport answers a reconnect with a stream before it knows whether a
 * turn is running, so only a chunk proves there is one: a settled session
 * closes empty.
 */
export async function withFirstChunk<T>(
  stream: ReadableStream<T>
): Promise<ReadableStream<T> | null> {
  const reader = stream.getReader()
  const first = await reader.read()

  if (first.done) return null

  let firstSent = false

  return new ReadableStream<T>({
    async pull(controller) {
      if (!firstSent) {
        firstSent = true
        controller.enqueue(first.value)
        return
      }

      const next = await reader.read()

      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

/**
 * Takes the chunk that would erase a message out of the stream a reload
 * resumes.
 *
 * Scoped to the one id that was already on screen when the page rendered:
 * every other `start` chunk names a message the thread does not have yet, and
 * dropping those would cost the turn its own identity for no reason.
 */
export function withoutContinuationOf(messageId: string) {
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "start" && chunk.messageId === messageId) return

      controller.enqueue(chunk)
    },
  })
}
