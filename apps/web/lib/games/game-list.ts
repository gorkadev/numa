import type { Game } from "@workspace/db/schema"

import { isGameId } from "@/lib/games/thread-page"

/**
 * What the sidebar and the command palette render of a game.
 *
 * These rows are props of client components, so everything in them is
 * serialized into the page sent to the browser. The chat access token, the
 * stream cursor and the sandbox id have no business there, and every game
 * would carry its own on every navigation. `lastTurnFinishedAt` and
 * `lastReadAt` stay because the unread dot is derived from them.
 */
export type GameListItem = Pick<
  Game,
  "id" | "title" | "pinnedAt" | "lastTurnFinishedAt" | "lastReadAt"
>

/** The columns a list row reads, so the shell never loads a game's heavy ones. */
export const GAME_LIST_COLUMNS = {
  id: true,
  title: true,
  pinnedAt: true,
  lastTurnFinishedAt: true,
  lastReadAt: true,
} as const satisfies Record<keyof GameListItem, true>

/** One page of unpinned games and the cursor of the next, `null` on the last. */
export type GamesPage = {
  items: GameListItem[]
  next: string | null
}

/**
 * Recent games per request: more than a tall sidebar shows, so the first
 * page fills it and the next one only loads once the list is scrolled.
 */
export const GAMES_PAGE_SIZE = 30

/**
 * A page from rows read one past the limit. The cursor is the last kept
 * game's id: the server reads that game's own `created_at` to continue from,
 * so the cursor never has to carry a timestamp at Postgres's precision.
 */
export function gamesPage(rows: GameListItem[], limit: number): GamesPage {
  const items = rows.slice(0, limit)
  const last = items.at(-1)

  return { items, next: rows.length > limit && last ? last.id : null }
}

type Serialized<T> = {
  [K in keyof T]: T[K] extends Date | null ? string | null : T[K]
}

const date = (value: string | null) => (value === null ? null : new Date(value))

/**
 * A page as it arrives over JSON, with its dates turned back into `Date`s, so
 * a fetched row and a server-rendered one are the same shape to every reader.
 */
export function reviveGamesPage(page: {
  items: Serialized<GameListItem>[]
  next: string | null
}): GamesPage {
  return {
    next: page.next,
    items: page.items.map((item) => ({
      ...item,
      pinnedAt: date(item.pinnedAt),
      lastTurnFinishedAt: date(item.lastTurnFinishedAt),
      lastReadAt: date(item.lastReadAt),
    })),
  }
}

/** `undefined` for the first page, `null` for a cursor that is not a game id. */
export function parseGamesCursor(
  value: string | null
): string | undefined | null {
  if (!value) return undefined
  return isGameId(value) ? value : null
}

/**
 * The games loaded so far, in the order the sidebar groups them: every pinned
 * game, then the recent pages in order. A game pinned after its page loaded
 * appears once, among the pinned, until that page is refetched without it.
 */
export function combineGames(
  pinned: readonly GameListItem[],
  pages: readonly GamesPage[]
): GameListItem[] {
  const seen = new Set(pinned.map((game) => game.id))
  const recents = pages
    .flatMap((page) => page.items)
    .filter((game) => !seen.has(game.id) && (seen.add(game.id), true))

  return [...pinned, ...recents]
}
