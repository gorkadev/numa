import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { and, eq, sql } from "drizzle-orm"

/**
 * Records that the player has seen the game's latest turn.
 *
 * Callers check `isGameUnread` on the row they already hold first, so opening
 * a game with nothing new costs no write at all. The predicate repeats that
 * check in SQL, so a stale row never moves the read mark needlessly, and
 * scopes to the owner: this is the tenant boundary, as in every other write.
 */
export async function markGameRead(gameId: string, userId: string): Promise<void> {
  await db
    .update(games)
    .set({ lastReadAt: sql`now()` })
    .where(
      and(
        eq(games.id, gameId),
        eq(games.userId, userId),
        sql`${games.lastTurnFinishedAt} > coalesce(${games.lastReadAt}, '-infinity')`
      )
    )
}
