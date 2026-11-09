"use client"

import { useEffect, useRef } from "react"
import {
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import {
  combineGames,
  moveGameToTop,
  reviveGamesPage,
  type GameListItem,
  type GamesPage,
  type GamesSort,
} from "@/lib/games/game-list"

type LoadedPages = { pages: GamesPage[]; pageParams: (string | null)[] }

/** One cache per order, so switching never shows pages read in the other. */
const queryKey = (sort: GamesSort) => ["sidebar-games", "recents", sort] as const

/**
 * Moves games whose player just sent a message to the top of the activity
 * order, as soon as their turn starts. The turn's first save stamps the same
 * order on the server, so the next render of the first page agrees; this only
 * saves waiting for it. The creation order never moves, so it is left alone.
 */
export function moveSidebarGamesToTop(
  queryClient: QueryClient,
  gameIds: readonly string[]
) {
  if (gameIds.length === 0) return

  queryClient.setQueryData<LoadedPages>(queryKey("activity"), (loaded) =>
    loaded
      ? {
          ...loaded,
          pages: gameIds.reduce(moveGameToTop, loaded.pages),
        }
      : loaded
  )
}

/**
 * The shell's game list: every pinned game, and the unpinned ones a page at a
 * time.
 *
 * The layout renders the pinned games and the first page. Creating, renaming,
 * pinning or deleting a game re-renders the layout (`refresh()` in
 * `lib/games/actions.ts`), so a new first page arriving is the signal that
 * the list changed: it replaces the cached first page at once, and any later
 * pages already loaded are refetched behind it, from the top, so a scrolled
 * list keeps its length without showing a game twice or in the wrong place.
 */
export function useSidebarGames({
  pinned,
  recents,
  sort,
}: {
  pinned: GameListItem[]
  recents: GamesPage
  sort: GamesSort
}) {
  const queryClient = useQueryClient()
  const key = queryKey(sort)

  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ sort })
      if (pageParam) params.set("after", pageParam)
      const response = await fetch(`/api/games/recents?${params}`)
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      return reviveGamesPage(await response.json())
    },
    getNextPageParam: (last) => last.next,
    initialData: { pages: [recents], pageParams: [null] },
  })

  const rendered = useRef(recents)
  useEffect(() => {
    if (rendered.current === recents) return
    rendered.current = recents

    const loaded = queryClient.getQueryData<LoadedPages>(key)

    queryClient.setQueryData(key, {
      pages: [recents, ...(loaded?.pages.slice(1) ?? [])],
      pageParams: loaded?.pageParams ?? [null],
    })
    if ((loaded?.pages.length ?? 1) > 1) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }, [queryClient, recents, key])

  /** Pinned first, then recents, each game once. */
  const games = combineGames(pinned, query.data?.pages ?? [recents])

  return {
    games,
    pinned,
    recents: games.slice(pinned.length),
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    loadMore: () => void query.fetchNextPage(),
  }
}
