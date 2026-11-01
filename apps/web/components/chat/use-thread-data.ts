"use client"

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import { useGameWorking } from "@/components/game-activity-provider"
import type { SubagentRunRecord } from "@/lib/games/harness/records"
import {
  reusableThread,
  threadQueryKey,
  threadScope,
  type ListedSubagentRun,
  type PanelRun,
  type StoredOutlinePage,
  type SubagentRunPage,
  type ThreadPage,
  type ThreadSnapshot,
} from "@/lib/games/thread-page"
import type { StoredOutlineTurn } from "@/lib/games/thread-outline"

export type ThreadKey = ReturnType<typeof threadQueryKey>

/** The key this game's mount read its thread under, for the panels below it. */
export const ThreadKeyContext = createContext<ThreadKey | null>(null)

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) throw new Error(`Request failed: ${response.status}`)

  return response.json() as Promise<T>
}

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
 * The thread a chat mounts with, or null until it exists. Reads the cache
 * directly rather than through an observer: `useChat` owns the messages from
 * the moment it mounts, so this only ever answers once, and a hit answers on
 * the first render with every page loaded before.
 *
 * Read once per mount, so a `lastTurnFinishedAt` arriving later cannot move a
 * live thread onto another key.
 */
export function useThreadSnapshot(gameId: string, lastTurnFinishedAt: number) {
  const client = useQueryClient()
  const working = useGameWorking(gameId)
  const [threadKey] = useState(() => threadQueryKey(gameId, lastTurnFinishedAt))

  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(() => {
    const cached = reusableThread(
      client.getQueryData<ThreadSnapshot>(threadKey),
      working
    )

    if (!cached) client.removeQueries({ queryKey: threadKey })

    return cached
  })
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (snapshot) return

    let active = true

    client
      .fetchQuery({
        queryKey: threadKey,
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
      .then((thread) => {
        if (active) setSnapshot(thread)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [attempt, client, gameId, snapshot, threadKey])

  const retry = useCallback(() => {
    setFailed(false)
    setAttempt((current) => current + 1)
  }, [])

  return { threadKey, snapshot, failed, retry }
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

/** A listed run's whole record, read when it is opened and kept from then on. */
export function useSubagentRunDetail(record: PanelRun) {
  const threadKey = use(ThreadKeyContext)

  return useQuery({
    queryKey: [...(threadKey ?? []), "subagent", record.agentId],
    enabled: record.listed === true && threadKey !== null,
    queryFn: () =>
      getJson<SubagentRunRecord>(
        `/api/games/${threadKey?.[1]}/subagents/${encodeURIComponent(record.agentId)}`
      ),
  })
}
