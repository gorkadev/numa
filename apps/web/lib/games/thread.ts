import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { and, eq } from "drizzle-orm"
import type { UIMessage } from "ai"

/**
 * A game's chat thread lives in `games.messages`. Unlike the rest of
 * `lib/games`, these helpers take `orgId` as an argument instead of deriving it
 * from `auth()`: the save runs inside the stream's `onEnd` callback, which
 * fires after the response has started and therefore cannot rely on Clerk's
 * request-scoped context still being readable. The route handler resolves the
 * session once, up front, and passes the result down — the tenant boundary is
 * still session-derived, never client-supplied.
 *
 * In both helpers the `org_id` predicate is part of the `WHERE` clause rather
 * than a check applied afterwards, so a game owned by another organization is
 * indistinguishable from one that does not exist.
 */

/**
 * Returns the persisted thread, or `undefined` when the game does not exist or
 * belongs to another organization. A game with no messages yet returns an empty
 * array — an existing game and an empty thread are different answers.
 *
 * The column's `UIMessage[]` type is an assertion, not a guarantee: `jsonb`
 * validates only that the value is JSON. The rows are checked by the caller,
 * which runs `validateUIMessages` over this history together with the incoming
 * message. Validating here as well would be redundant, and impossible besides:
 * `validateUIMessages` rejects an empty array, which is precisely the state a
 * brand-new game is in.
 */
export async function loadGameThread({
  gameId,
  orgId,
}: {
  gameId: string
  orgId: string
}): Promise<UIMessage[] | undefined> {
  const game = await db.query.games.findFirst({
    columns: { messages: true },
    where: (game, { and, eq }) =>
      and(eq(game.id, gameId), eq(game.orgId, orgId)),
  })

  if (!game) return undefined

  return game.messages
}

/**
 * Rewrites the whole thread — one game owns one chat, so a turn is a full
 * document write rather than an append.
 */
export async function saveGameThread({
  gameId,
  orgId,
  messages,
}: {
  gameId: string
  orgId: string
  messages: UIMessage[]
}): Promise<void> {
  await db
    .update(games)
    .set({ messages })
    .where(and(eq(games.id, gameId), eq(games.orgId, orgId)))
}
