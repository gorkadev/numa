import type { UIMessageChunk } from "ai"

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
