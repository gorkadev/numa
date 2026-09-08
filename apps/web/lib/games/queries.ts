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

/**
 * Reads a single game by id. The `org_id` predicate is part of the lookup, not
 * a check performed afterwards, so a game belonging to another organization is
 * indistinguishable from one that does not exist — the caller cannot probe for
 * ids it does not own.
 */
export async function getGame(id: string): Promise<Game | undefined> {
  const { orgId } = await auth.protect()

  if (!orgId) return undefined

  return db.query.games.findFirst({
    where: (game, { and, eq }) => and(eq(game.id, id), eq(game.orgId, orgId)),
  })
}
