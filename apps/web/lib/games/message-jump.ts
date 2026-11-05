/**
 * Jumping to one message of a thread from outside it — the command palette's
 * message hits. The request is held in memory rather than in the URL: it means
 * nothing once used, a reload must open the thread as usual, and a query
 * parameter written and then stripped shows in the address bar for a moment.
 */

export type MessageJump = {
  gameId: string
  /** The message's index in the thread, what a page of history is requested by. */
  position: number
  messageId: string
  /** The text the search matched, highlighted once the message is on screen. */
  query: string
}

let pending: MessageJump | null = null
const listeners = new Set<() => void>()

/** Asks the thread of `jump.gameId` to open at the message, replacing any earlier request. */
export function requestMessageJump(jump: MessageJump): void {
  pending = jump
  for (const listener of listeners) listener()
}

/** The request waiting for `gameId`'s thread, if any; it stays until `settleMessageJump`. */
export function pendingMessageJump(gameId: string): MessageJump | null {
  return pending?.gameId === gameId ? pending : null
}

/** Drops `jump` once the thread has acted on it, unless a newer request replaced it. */
export function settleMessageJump(jump: MessageJump): void {
  if (pending !== jump) return
  pending = null
  for (const listener of listeners) listener()
}

export function subscribeMessageJump(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The id of the row holding `messageId`. A row is a run of messages, named
 * after its first one: consecutive assistant messages share a row, so a
 * message past the first is not a row id of its own.
 */
export function runIdContaining(
  runs: readonly { id: string; messages: readonly { id: string }[] }[],
  messageId: string
): string | null {
  return (
    runs.find((run) => run.messages.some((message) => message.id === messageId))
      ?.id ?? null
  )
}

export type TextPoint = { node: number; offset: number }

/**
 * Where `query` first occurs, case aside, across consecutive text nodes, as
 * the node index and offset of its start and end — what a DOM `Range` is built
 * from. A match may span nodes, since inline markup splits rendered text.
 * `null` when the text does not contain it.
 */
export function findTextSpan(
  texts: readonly string[],
  query: string
): { start: TextPoint; end: TextPoint } | null {
  const needle = query.toLowerCase()
  if (!needle) return null

  const index = texts.join("").toLowerCase().indexOf(needle)
  if (index === -1) return null

  return {
    start: pointAt(texts, index, false),
    end: pointAt(texts, index + needle.length, true),
  }
}

/**
 * The node and offset of character `index` of the joined text. On a boundary
 * between nodes, a start belongs to the next node and an end to the previous
 * one, so the span never begins or ends on an empty edge.
 */
function pointAt(
  texts: readonly string[],
  index: number,
  isEnd: boolean
): TextPoint {
  let remaining = index

  for (let node = 0; node < texts.length; node++) {
    const length = texts[node]!.length
    if (isEnd ? remaining <= length : remaining < length) {
      return { node, offset: remaining }
    }
    remaining -= length
  }

  const last = texts.length - 1
  return { node: last, offset: texts[last]!.length }
}
