"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
  isCancelledError,
} from "@tanstack/react-query"

import {
  getJson,
  ThreadKeyContext,
  type ThreadKey,
} from "@/components/chat/use-subagent-run-detail"
import { useGameWorking } from "@/components/game-activity-provider"
import {
  replacesThread,
  reusableThread,
  threadQueryKey,
  threadScope,
  type ListedSubagentRun,
  type StoredOutlinePage,
  type SubagentRunPage,
  type ThreadPage,
  type ThreadSnapshot,
} from "@/lib/games/thread-page"
import type { StoredOutlineTurn } from "@/lib/games/thread-outline"

export { ThreadKeyContext, type ThreadKey }

function withCursor(path: string, name: string, value: number | undefined) {
  return value === undefined ? path : `${path}?${name}=${value}`
}

export function fetchThreadPage(gameId: string, before?: number) {
  return getJson<ThreadPage & { stats: ThreadSnapshot["stats"] }>(
    withCursor(`/api/games/${gameId}/thread`, "before", before)
  )
}

/**
 * Forgets a game's cached thread: its turn has started or finished, so what is
 * held no longer matches. A query something is still showing is left alone, or
 * the open game's lists would fetch again for data the stream already delivered.
 */
export function evictThread(client: QueryClient, gameId: string) {
  client.removeQueries({
    queryKey: threadScope(gameId),
    predicate: (query) => !query.isActive(),
  })
}

/**
 * The thread a chat shows, or null until it exists. Reads the cache directly
 * rather than through an observer: `useChat` owns the messages from the moment
 * it mounts, so a hit answers on the first render with every page loaded before.
 *
 * `rowSettled` holds a miss back until the row has been read again: a working
 * game needs the row's stream cursor, and a turn the cached row has not heard
 * of would have this fetch under a key that is about to change.
 *
 * A revalidated `lastTurnFinishedAt` moves a mounted thread only by
 * `replacesThread`, and the old thread stays on screen until the new one is in
 * hand, so a replacement has no empty frame.
 */
export function useThreadSnapshot(
  gameId: string,
  lastTurnFinishedAt: number,
  rowSettled: boolean
) {
  const client = useQueryClient()
  const working = useGameWorking(gameId)

  const readCached = (turn: number) => {
    const key = threadQueryKey(gameId, turn)
    const cached = reusableThread(client.getQueryData<ThreadSnapshot>(key), working)

    if (!cached) client.removeQueries({ queryKey: key })

    return cached
  }

  const [target, setTarget] = useState(lastTurnFinishedAt)
  const [seen, setSeen] = useState(lastTurnFinishedAt)
  const [followed, setFollowed] = useState(false)
  const [shown, setShown] = useState<{ turn: number; snapshot: ThreadSnapshot } | null>(() => {
    const snapshot = readCached(lastTurnFinishedAt)

    return snapshot ? { turn: lastTurnFinishedAt, snapshot } : null
  })
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  /**
   * Reported by the chat itself, not read off `working`: a mounted chat only
   * reconnects once, on mount, so a turn started in another tab runs here
   * without ever reaching its stream, and that thread has to be replaced.
   */
  const followTurn = useCallback(() => setFollowed(true), [])

  if (lastTurnFinishedAt !== seen && !working) {
    setSeen(lastTurnFinishedAt)
    setFollowed(false)

    if (
      replacesThread({
        seen,
        revalidated: lastTurnFinishedAt,
        working,
        held: followed && shown !== null,
      })
    ) {
      const snapshot = readCached(lastTurnFinishedAt)

      setTarget(lastTurnFinishedAt)
      setFailed(false)
      if (snapshot) setShown({ turn: lastTurnFinishedAt, snapshot })
    }
  }

  useEffect(() => {
    if (shown?.turn === target || !rowSettled) return

    let active = true

    client
      .fetchQuery({
        queryKey: threadQueryKey(gameId, target),
        staleTime: 0,
        queryFn: async (): Promise<ThreadSnapshot> => {
          const page = await fetchThreadPage(gameId)

          return {
            messages: page.messages,
            cursor: page.start,
            stats: page.stats,
          }
        },
      })
      .then((snapshot) => {
        if (active) setShown({ turn: target, snapshot })
      })
      .catch((error: unknown) => {
        if (!active) return

        /** A turn finishing mid-fetch evicts this query; that is not a failure. */
        if (isCancelledError(error)) setAttempt((current) => current + 1)
        else setFailed(true)
      })

    return () => {
      active = false
    }
  }, [attempt, client, gameId, rowSettled, shown?.turn, target])

  const retry = useCallback(() => {
    setFailed(false)
    setAttempt((current) => current + 1)
  }, [])

  return {
    threadKey: threadQueryKey(gameId, shown?.turn ?? target),
    snapshot: shown?.snapshot ?? null,
    failed,
    retry,
    followTurn,
  }
}

/**
 * Every turn of the thread, fetched after first paint and page by page until
 * there are no more: the rail draws them all, so nothing waits on a gesture.
 */
export function useThreadOutline(threadKey: ThreadKey): StoredOutlineTurn[] {
  const [, gameId] = threadKey

  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage } =
    useInfiniteQuery({
      queryKey: [...threadKey, "outline"],
      initialPageParam: undefined as number | undefined,
      queryFn: ({ pageParam }) =>
        getJson<StoredOutlinePage>(
          withCursor(`/api/games/${gameId}/thread/outline`, "after", pageParam)
        ),
      getNextPageParam: (last) => last.next ?? undefined,
    })

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage])

  return useMemo(
    () => data?.pages.flatMap(({ turns }) => turns) ?? [],
    [data]
  )
}

/** The game's runs, loaded a page at a time as the list scrolls. */
export function useSubagentList(threadKey: ThreadKey) {
  const [, gameId] = threadKey

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: [...threadKey, "subagents"],
      initialPageParam: undefined as number | undefined,
      queryFn: ({ pageParam }) =>
        getJson<SubagentRunPage>(
          withCursor(`/api/games/${gameId}/subagents`, "after", pageParam)
        ),
      getNextPageParam: (last) => last.next ?? undefined,
    })

  const listed = useMemo<ListedSubagentRun[]>(
    () => data?.pages.flatMap(({ runs }) => runs) ?? [],
    [data]
  )

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  return { listed, hasMore: hasNextPage, loadMore }
}
