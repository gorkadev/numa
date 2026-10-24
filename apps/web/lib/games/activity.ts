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

    const gameId = gameIdOf(run)
    if (gameId) ids.add(gameId)
  }

  return ids
}

/**
 * Every game the subscription currently has a run for, working or not. Only a
 * game seen here can be said to have finished: one that merely dropped out of
 * the list — a resubscribe that has not replayed it yet — tells us nothing.
 */
export function seenGameIds(runs: readonly ActivityRun[]): Set<string> {
  const ids = new Set<string>()

  for (const run of runs) {
    const gameId = gameIdOf(run)
    if (gameId) ids.add(gameId)
  }

  return ids
}

function gameIdOf(run: ActivityRun): string | undefined {
  return run.tags.find((tag) => tag.startsWith(CHAT_TAG_PREFIX))?.slice(CHAT_TAG_PREFIX.length)
}

export type ActivityStore = ReturnType<typeof createActivityStore>

/**
 * The one place a tab keeps which games are working and which finished with
 * something unread, read through `useSyncExternalStore` so a row re-renders
 * only when its own game flips. The turn-finished toasts come from the same
 * transition that lights the unread dot (see `finishedTurnNotices`).
 *
 * Unread starts from the server (`isGameUnread` on the rows the layout already
 * loaded) and then moves live: the layout never re-renders while the player
 * stays in the app, so a turn that finishes later is learned from the run
 * subscription, as a game leaving the working set.
 *
 * Listeners hear about real changes only: every metadata write reaches the
 * subscription two or three times (the SDK writes keys of its own), and those
 * repeats must not wake every row in the sidebar.
 */
export function createActivityStore() {
  let working = new Set<string>()
  const unread = new Set<string>()
  const titles = new Map<string, string>()
  let openGameId: string | undefined
  const listeners = new Set<() => void>()

  function notify() {
    for (const listener of listeners) listener()
  }

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
    isUnread(gameId: string) {
      return unread.has(gameId)
    },
    /** Game titles for the toasts, from the rows the sidebar already loads. */
    seedTitles(entries: Iterable<readonly [string, string]>) {
      for (const [id, title] of entries) titles.set(id, title)
    },
    titleOf(gameId: string): string | undefined {
      return titles.get(gameId)
    },
    markRead(gameId: string) {
      if (unread.delete(gameId)) notify()
    },
    /**
     * Adds the server's unread games. The open game is skipped: its page marks
     * it read while the sidebar's list may have been loaded just before that.
     */
    seedUnread(gameIds: Iterable<string>) {
      let changed = false
      for (const id of gameIds) {
        if (id !== openGameId && !unread.has(id)) {
          unread.add(id)
          changed = true
        }
      }
      if (changed) notify()
    },
    /** The game on screen, if any — opening it is what reads it. */
    setOpenGame(gameId: string | undefined) {
      openGameId = gameId
      if (gameId && unread.delete(gameId)) notify()
    },
    /**
     * Returns the games whose turn just finished: working before, still in
     * `seen`, and no longer working. Each becomes unread unless it is the game
     * the player has open, which they are reading as it finishes.
     */
    setWorking(next: Set<string>, seen: Set<string> = new Set()): string[] {
      const finished = [...working].filter((id) => seen.has(id) && !next.has(id))
      const workingChanged =
        next.size !== working.size || [...next].some((id) => !working.has(id))
      let unreadChanged = false

      for (const id of finished) {
        if (id !== openGameId && !unread.has(id)) {
          unread.add(id)
          unreadChanged = true
        }
      }

      if (workingChanged) working = next
      if (workingChanged || unreadChanged) notify()

      return finished
    },
  }
}

/**
 * The "turn finished" toasts for what `setWorking` just reported: every game
 * but the one on screen, the same rule the unread dot follows. Only live
 * transitions get here — unread games seeded from the server never do — so a
 * reload never replays toasts for turns that ended while the player was away.
 */
export function finishedTurnNotices(
  finished: readonly string[],
  openGameId: string | undefined,
  titleOf: (gameId: string) => string | undefined
): { gameId: string; title: string | undefined }[] {
  return finished
    .filter((gameId) => gameId !== openGameId)
    .map((gameId) => ({ gameId, title: titleOf(gameId) }))
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
