import { db } from "@workspace/db"
import type { Game } from "@workspace/db/schema"

import { requireSession } from "@/lib/session"

/**
 * Every read is scoped to the caller's own `user_id` — the tenant boundary,
 * so it is derived from the session here and never accepted as an argument.
 *
 * Ordered pinned-first, most-recently-pinned first, then everything else
 * newest first — the one query answers both the sidebar's "Pinned" group and
 * its "Recents" group, which only split the same list on `pinnedAt` rather
 * than issuing a second query for it. `nulls last` on the first key is load
 * bearing: Postgres's own default for `desc` is `nulls first`, which would
 * put every unpinned game ahead of the pinned ones instead of behind them.
 */
/**
 * A game without its thread. The thread is the whole conversation, tool calls
 * and the files they wrote included — megabytes per game — so anything that
 * only needs a game's name or state must not pull it over the network.
 */
export type GameSummary = Omit<Game, "messages">

export async function listGames(): Promise<GameSummary[]> {
  const { user } = await requireSession()

  /**
   * Runs on every render of the app shell, for every game the user has: the
   * thread is left out, or each navigation would transfer every conversation.
   */
  return db.query.games.findMany({
    columns: { messages: false },
    where: (game, { eq }) => eq(game.userId, user.id),
    orderBy: (game, { desc, sql }) => [
      sql`${game.pinnedAt} desc nulls last`,
      desc(game.createdAt),
    ],
  })
}

/**
 * Reads a single game by id. The `user_id` predicate is part of the lookup,
 * not a check performed afterwards, so a game belonging to another user is
 * indistinguishable from one that does not exist — the caller cannot probe
 * for ids it does not own.
 */
export async function getGame(id: string): Promise<Game | undefined> {
  const { user } = await requireSession()

  return db.query.games.findFirst({
    where: (game, { and, eq }) =>
      and(eq(game.id, id), eq(game.userId, user.id)),
  })
}

/**
 * Reads a single game by id alone, with no session and no `user_id` predicate.
 *
 * This deliberately steps outside the tenant boundary every other read in this
 * module enforces, because the preview proxy cannot get inside it: the game runs
 * in a frame on an opaque origin, whose module scripts are fetched without
 * cookies, so there is no session to find. The proxy proves authorization a
 * different way — with a short-lived token this server signed for this exact
 * game id.
 *
 * So the token check is not a convenience the caller may skip; it *is* the
 * access control this function does not perform. Call this only after
 * `verifyPreviewToken` has returned `true` for the same id. Anywhere else, use
 * `getGame`.
 */
export async function getGameForPreview(id: string): Promise<GameSummary | undefined> {
  /**
   * Called for every file the game requests — each module, each sprite — so
   * the thread is left out: a game with hundreds of assets would otherwise read
   * its whole conversation hundreds of times on a single load.
   */
  return db.query.games.findFirst({
    columns: { messages: false },
    where: (game, { eq }) => eq(game.id, id),
  })
}
