import type { UIMessageChunk } from "ai"

/**
 * The custom stream part the agent writes when a turn has changed the game's
 * files, and the browser reads to know its preview is stale.
 *
 * It is a `data-*` part rather than a field on the assistant's message because
 * it is a notification, not content: nothing about it belongs in the thread the
 * next turn re-reads.
 */
const PART_TYPE = "data-game-revision"

/**
 * The stream part, ready to hand to a `ChatWriter`.
 *
 * `transient` is what keeps it out of the stored thread. A persisted data part
 * would be replayed on every reload of the game and re-converted into the
 * model's history on every later turn — a reload instruction living forever in
 * a conversation, aimed at a browser that has already obeyed it.
 */
export function gameRevisionChunk(revision: number): UIMessageChunk {
  return { type: PART_TYPE, data: { revision }, transient: true }
}

/**
 * The revision carried by a stream part, or `null` for any other part.
 *
 * The input is `unknown`-shaped by design: `onData` hands over every custom
 * part the agent writes, and this one crossed a network boundary to get here,
 * so its contents are checked rather than asserted.
 */
export function readGameRevision(part: {
  type: string
  data?: unknown
}): number | null {
  if (part.type !== PART_TYPE) return null

  const { data } = part

  if (typeof data !== "object" || data === null) return null

  const revision = (data as { revision?: unknown }).revision

  return typeof revision === "number" ? revision : null
}
