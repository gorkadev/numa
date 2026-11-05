import { and, count, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "@workspace/db"
import { games, turnUsage } from "@workspace/db/schema"

import {
  ACTIVITY_WINDOW_DAYS,
  type ProfileActivity,
} from "@/lib/profile/activity"

/**
 * Everything the profile shows about a user's activity, read in parallel.
 *
 * Activity is grouped by UTC hour rather than by day: the viewer's time zone
 * is only known in the browser, which folds these hours into local days (see
 * `lib/profile/activity.ts`). Only hours with a turn come back, so a year of
 * daily use is a few thousand small rows at most, read through
 * `turn_usage_user_id_created_at_idx`. Two extra days cover the widest UTC
 * offsets at either end of the window.
 */
export async function readProfileActivity(
  userId: string
): Promise<ProfileActivity> {
  const hour = sql<Date>`date_trunc('hour', ${turnUsage.createdAt})`

  const [buckets, [games_], topGames] = await Promise.all([
    db
      .select({
        hour,
        turns: sql<number>`count(*)::int`,
        credits: sql<number>`coalesce(sum(${turnUsage.credits}), 0)::int`,
        tokens: sql<number>`coalesce(sum(${turnUsage.inputTokens} + ${turnUsage.outputTokens}), 0)::float8`,
      })
      .from(turnUsage)
      .where(
        and(
          eq(turnUsage.userId, userId),
          gte(
            turnUsage.createdAt,
            sql`now() - make_interval(days => ${ACTIVITY_WINDOW_DAYS + 2})`
          )
        )
      )
      .groupBy(hour)
      .orderBy(hour),
    db.select({ value: count() }).from(games).where(eq(games.userId, userId)),
    // Games deleted since still have usage rows; the join leaves them out.
    db
      .select({
        id: games.id,
        title: games.title,
        turns: sql<number>`count(*)::int`,
      })
      .from(turnUsage)
      .innerJoin(games, eq(games.id, turnUsage.gameId))
      .where(eq(turnUsage.userId, userId))
      .groupBy(games.id, games.title)
      .orderBy(desc(sql`count(*)`))
      .limit(3),
  ])

  return {
    buckets: buckets.map((row) => ({
      hour: new Date(row.hour).toISOString(),
      turns: row.turns,
      credits: row.credits,
      tokens: row.tokens,
    })),
    gameCount: games_?.value ?? 0,
    topGames,
  }
}
