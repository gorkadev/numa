import { db } from "@workspace/db"
import type { Game } from "@workspace/db/schema"

import {
  GAME_LIST_COLUMNS,
  GAMES_PAGE_SIZE,
  gamesPage,
  type GameListItem,
  type GamesPage,
} from "@/lib/games/game-list"
import { requireSession } from "@/lib/session"

/**
 * Every read is scoped to the caller's own `user_id` — the tenant boundary,
 * so it is derived from the session here and never accepted as an argument.
 * (`readRecentGames` takes the id from callers that already resolved it from
 * the session, so one request does not resolve it twice.)
 */
/**
 * A game's row. Its thread lives in `game_messages`, read in pages, so the row
 * stays small enough to read on every request.
 */
export type GameSummary = Game

export type { GameListItem } from "@/lib/games/game-list"

/**
 * Every pinned game, most recently pinned first. Never paginated: pinning is
 * a deliberate act, so the set stays small, and the sidebar shows all of it.
 */
export async function listPinnedGames(): Promise<GameListItem[]> {
  const { user } = await requireSession()

  return db.query.games.findMany({
    columns: GAME_LIST_COLUMNS,
    where: (game, { and, eq, isNotNull }) =>
      and(eq(game.userId, user.id), isNotNull(game.pinnedAt)),
    orderBy: (game, { desc }) => [desc(game.pinnedAt)],
  })
}

/**
 * One page of the user's unpinned games, newest first.
 *
 * Keyset pagination on `(created_at, id)`. The cursor is only the last game's
 * id, and its `created_at` is read here, in the same statement: the stored
 * microseconds never cross JavaScript, which keeps milliseconds and would
 * place the cursor between two rows. A cursor naming a game that is gone (or
 * someone else's) matches nothing and ends the list instead of restarting it.
 */
export async function readRecentGames(
  userId: string,
  after?: string
): Promise<GamesPage> {
  const rows = await db.query.games.findMany({
    columns: GAME_LIST_COLUMNS,
    where: (game, { and, eq, isNull, sql }) =>
      and(
        eq(game.userId, userId),
        isNull(game.pinnedAt),
        after
          ? sql`(${game.createdAt}, ${game.id}) < (select g.created_at, g.id from games g where g.id = ${after} and g.user_id = ${userId})`
          : undefined
      ),
    orderBy: (game, { desc }) => [desc(game.createdAt), desc(game.id)],
    limit: GAMES_PAGE_SIZE + 1,
  })

  return gamesPage(rows, GAMES_PAGE_SIZE)
}

/**
 * What the app shell renders the game list from: all pinned games and the
 * first page of the rest. Runs on every render of the shell, so it reads a
 * bounded number of rows however many games the user has.
 */
export async function listSidebarGames(): Promise<{
  pinned: GameListItem[]
  recents: GamesPage
}> {
  const { user } = await requireSession()
  const [pinned, recents] = await Promise.all([
    listPinnedGames(),
    readRecentGames(user.id),
  ])

  return { pinned, recents }
}

/**
 * Reads a single game by id. The `user_id` predicate is part of the lookup,
 * not a check performed afterwards, so a game belonging to another user is
 * indistinguishable from one that does not exist — the caller cannot probe
 * for ids it does not own.
 */
export async function getGame(id: string): Promise<GameSummary | undefined> {
  const { user } = await requireSession()

  return db.query.games.findFirst({
    where: (game, { and, eq }) =>
      and(eq(game.id, id), eq(game.userId, user.id)),
  })
}

/**
 * The sandbox id of a game the caller owns, or `undefined` when the game does
 * not exist, belongs to someone else, or has no sandbox yet.
 *
 * Same tenant predicate as `getGame`, for the routes that only need to reach
 * the sandbox and no other column.
 */
export async function getGameSandboxId(id: string): Promise<string | undefined> {
  const { user } = await requireSession()

  const game = await db.query.games.findFirst({
    columns: { sandboxId: true },
    where: (game, { and, eq }) =>
      and(eq(game.id, id), eq(game.userId, user.id)),
  })

  return game?.sandboxId ?? undefined
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
  return db.query.games.findFirst({
    where: (game, { eq }) => eq(game.id, id),
  })
}
