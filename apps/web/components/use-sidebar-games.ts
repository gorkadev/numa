"use client"

import { useEffect, useRef } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"

import {
  combineGames,
  reviveGamesPage,
  type GameListItem,
  type GamesPage,
} from "@/lib/games/game-list"

const QUERY_KEY = ["sidebar-games", "recents"] as const

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
}: {
  pinned: GameListItem[]
  recents: GamesPage
}) {
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: QUERY_KEY,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/games/recents?after=${encodeURIComponent(pageParam)}`
        : "/api/games/recents"
      const response = await fetch(url)
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

    const loaded = queryClient.getQueryData<{
      pages: GamesPage[]
      pageParams: (string | null)[]
    }>(QUERY_KEY)

    queryClient.setQueryData(QUERY_KEY, {
      pages: [recents, ...(loaded?.pages.slice(1) ?? [])],
      pageParams: loaded?.pageParams ?? [null],
    })
    if ((loaded?.pages.length ?? 1) > 1) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    }
  }, [queryClient, recents])

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
