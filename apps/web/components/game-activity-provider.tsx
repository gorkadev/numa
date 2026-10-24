"use client"

import { createContext, use, useEffect, useState, useSyncExternalStore } from "react"
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks"

import {
  activityTag,
  createActivityStore,
  workingGameIds,
  type ActivityStore,
} from "@/lib/games/activity"
import { mintGameActivityToken } from "@/lib/games/activity-actions"

/**
 * Renewed well before the token's one-hour expiry. A token that does expire
 * is not reported as an error: the subscription just closes, so waiting for a
 * failure would leave the sidebar silently frozen.
 */
const TOKEN_REFRESH_MS = 50 * 60 * 1000

/**
 * Only runs created in the last week are replayed on subscribe. Without a
 * window the server sends every run the player ever had, ended ones included,
 * on every page load. A week is the most the API allows, and no chat run stays
 * alive that long.
 */
const RUN_WINDOW = "1w"

const ActivityContext = createContext<ActivityStore | null>(null)

/**
 * One realtime subscription per tab for every game of the player — not one per
 * row and not one per open chat, which is exactly what goes away when the chat
 * unmounts. Mounted in the app shell, so it outlives navigation between games.
 */
export function GameActivityProvider({
  userId,
  initialToken,
  children,
}: {
  userId: string
  initialToken: string
  children: React.ReactNode
}) {
  const [store] = useState(createActivityStore)
  const [accessToken, setAccessToken] = useState(initialToken)

  useEffect(() => {
    const interval = setInterval(() => {
      mintGameActivityToken().then(setAccessToken, () => {
        /* Keeps the current token; the next tick tries again. */
      })
    }, TOKEN_REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  const { runs } = useRealtimeRunsWithTag(activityTag(userId), {
    accessToken,
    createdAt: RUN_WINDOW,
    skipColumns: ["payload", "output"],
  })

  useEffect(() => {
    store.setWorking(workingGameIds(runs))
  }, [runs, store])

  return <ActivityContext value={store}>{children}</ActivityContext>
}

/** Whether this game's agent is mid-turn; re-renders only when that flips. */
export function useGameWorking(gameId: string): boolean {
  const store = use(ActivityContext)

  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.isWorking(gameId) ?? false,
    () => false
  )
}

function noopSubscribe() {
  return () => {}
}
