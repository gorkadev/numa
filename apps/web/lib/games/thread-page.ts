import type { UIMessage } from "ai"

import type { SubagentRunRecord } from "@/lib/games/harness/records"

/**
 * How many turns one page of history holds. Pages are counted in turns rather
 * than messages so each starts on a user message: `groupRuns` folds consecutive
 * assistant messages into one row, and a page starting between them would
 * change that row's identity when the page before it arrives.
 */
export const THREAD_PAGE_TURNS = 5

/**
 * What the thread knows about the history it has not loaded.
 *
 * `cursor` is the position of the oldest loaded message, so 0 means there is
 * nothing earlier. `stats` holds a metadata-only skeleton of each unloaded
 * reply, which is all the session totals read; the footer can then keep
 * describing the whole conversation without transferring it.
 */
export type EarlierThread = { cursor: number; stats: UIMessage[] }

export function threadRows(gameId: string, messages: UIMessage[]) {
  return messages.map((message, position) => ({
    gameId,
    position,
    role: message.role,
    message,
  }))
}

export function subagentRows(gameId: string, runs: SubagentRunRecord[]) {
  return runs.map((run, position) => ({
    gameId,
    agentId: run.agentId,
    position,
    record: run as Record<string, unknown>,
  }))
}

/**
 * A running turn can have saved a message the browser already holds, and that
 * live copy is the one being streamed into, so it wins over the stored one.
 */
export function mergeEarlierMessages(
  current: UIMessage[],
  older: UIMessage[]
): UIMessage[] {
  const held = new Set(current.map(({ id }) => id))

  return [...older.filter(({ id }) => !held.has(id)), ...current]
}

/** Without this, a page that just loaded would count twice in the totals. */
export function withoutLoadedStats(
  stats: UIMessage[],
  loaded: UIMessage[]
): UIMessage[] {
  const ids = new Set(loaded.map(({ id }) => id))

  return stats.filter(({ id }) => !ids.has(id))
}
