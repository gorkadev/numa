import type { Game } from "@workspace/db/schema"

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
