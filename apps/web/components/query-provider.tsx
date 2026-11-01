"use client"

import {
  environmentManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"

/**
 * Nothing cached here goes stale by age: a thread changes only when a turn
 * runs, which the cache key and `evictThread` account for, so time alone is
 * never a reason to ask again or to forget.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient()

  browserQueryClient ??= makeQueryClient()

  return browserQueryClient
}

/**
 * A module-level client rather than `useState`, which React would throw away
 * if the first render suspends. Mounted in the app shell so the cache outlives
 * navigation between games.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  )
}
