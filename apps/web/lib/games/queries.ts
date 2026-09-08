import { auth } from "@clerk/nextjs/server"
import { db } from "@workspace/db"
import type { Game } from "@workspace/db/schema"

/**
 * Every read is scoped to the caller's active Clerk organization — the `org_id`
 * predicate is the tenant boundary, so it is derived from the session here and
 * never accepted as an argument.
 *
 * A signed-in user with no active organization owns no games, so the empty list
 * is the correct answer rather than an error.
 */
export async function listGames(): Promise<Game[]> {
  const { orgId } = await auth.protect()

  if (!orgId) return []

  return db.query.games.findMany({
    where: (game, { eq }) => eq(game.orgId, orgId),
    orderBy: (game, { desc }) => desc(game.createdAt),
  })
}
