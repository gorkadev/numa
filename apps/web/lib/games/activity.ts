import type { Game } from "@workspace/db/schema"

/**
 * The tag every chat run of a player carries, added by the agent on boot. It
 * is what one realtime subscription per tab filters on, and what the token
 * that subscription uses is scoped to — a player can only ever read their own.
 */
export function activityTag(userId: string): string {
  return `user:${userId}`
}

/** `chat.agent` tags every run with `chat:<chatId>`, and a game's id is its chat id. */
const CHAT_TAG_PREFIX = "chat:"

type ActivityRun = {
  tags: string[]
  metadata?: Record<string, unknown>
  isCompleted: boolean
  isCancelled: boolean
}

/**
 * The games whose agent is mid-turn right now.
 *
 * A run is not "working" just for being alive: it stays `EXECUTING` while it
 * waits idle for the next message, so the turn hooks set a `working` metadata
 * flag instead. A run that ended — `isCompleted` covers success and failure,
 * but not cancellation — is never working, whatever flag it last wrote, which
 * is what clears the sidebar when a run crashes mid-turn.
 */
export function workingGameIds(runs: readonly ActivityRun[]): Set<string> {
  const ids = new Set<string>()

  for (const run of runs) {
    if (run.isCompleted || run.isCancelled || run.metadata?.working !== true) continue

    const chatTag = run.tags.find((tag) => tag.startsWith(CHAT_TAG_PREFIX))
    if (chatTag) ids.add(chatTag.slice(CHAT_TAG_PREFIX.length))
  }

  return ids
}

export type ActivityStore = ReturnType<typeof createActivityStore>

/**
 * The one place a tab keeps which games are working, read through
 * `useSyncExternalStore` so a row re-renders only when its own game flips.
 *
 * Listeners hear about real changes only: every metadata write reaches the
 * subscription two or three times (the SDK writes keys of its own), and those
 * repeats must not wake every row in the sidebar.
 */
export function createActivityStore() {
  let working = new Set<string>()
  const listeners = new Set<() => void>()

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isWorking(gameId: string) {
      return working.has(gameId)
    },
    setWorking(next: Set<string>) {
      if (next.size === working.size && [...next].every((id) => working.has(id))) return
      working = next
      for (const listener of listeners) listener()
    },
  }
}

/**
 * Whether the agent finished a turn the player has not opened since — the
 * sidebar's "something to read" dot.
 *
 * Both timestamps are written with the database's own `now()`, never a
 * process clock: the turn ends on a Trigger.dev worker and the read happens on
 * the Next server, so comparing two machines' clocks could order them wrong.
 */
export function isGameUnread(
  game: Pick<Game, "lastTurnFinishedAt" | "lastReadAt">
): boolean {
  if (!game.lastTurnFinishedAt) return false
  if (!game.lastReadAt) return true

  return game.lastTurnFinishedAt > game.lastReadAt
}
