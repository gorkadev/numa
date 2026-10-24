"use client"

import { createContext, use, useEffect, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks"

import {
  activityTag,
  createActivityStore,
  seenGameIds,
  workingGameIds,
  type ActivityStore,
} from "@/lib/games/activity"
import { markOpenGameRead, mintGameActivityToken } from "@/lib/games/activity-actions"

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

  const { runs } = useRealtimeRunsWithTag(activityTag(userId), {
    accessToken: initialToken,
    /**
     * Renewal has to go through the client: the hook never resubscribes when
     * `accessToken` changes, and the open stream keeps the headers it started
     * with. On a 401 or 403 the stream calls this, swaps the token and carries
     * on, so the hourly expiry never freezes the sidebar.
     */
    refreshAccessToken: mintGameActivityToken,
    createdAt: RUN_WINDOW,
    skipColumns: ["payload", "output"],
  })

  const openGameId = OPEN_GAME.exec(usePathname())?.[1]

  useEffect(() => {
    store.setOpenGame(openGameId)
  }, [openGameId, store])

  useEffect(() => {
    const finished = store.setWorking(workingGameIds(runs), seenGameIds(runs))

    /**
     * Safe to write the moment the flag drops: the agent clears `working`
     * only after the save that stamps the finish, so this read lands after it.
     */
    if (openGameId && finished.includes(openGameId)) {
      markOpenGameRead(openGameId).catch(() => {
        /* Only leaves the dot showing on the next load. */
      })
    }
  }, [runs, store, openGameId])

  return <ActivityContext value={store}>{children}</ActivityContext>
}

/** `/games/<id>`, with or without a locale prefix; not `/games/<id>/play`. */
const OPEN_GAME = /\/games\/([^/]+)$/

/** Whether this game's agent is mid-turn; re-renders only when that flips. */
export function useGameWorking(gameId: string): boolean {
  const store = use(ActivityContext)

  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.isWorking(gameId) ?? false,
    () => false
  )
}

/** Whether this game finished a turn the player has not opened since. */
export function useGameUnread(gameId: string): boolean {
  const store = use(ActivityContext)

  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.isUnread(gameId) ?? false,
    () => false
  )
}

/**
 * Hands the server's unread games to the store. Called by the sidebar, which
 * is what loads the game list — inside its own Suspense boundary, below this
 * provider — so the list never needs a query of its own.
 */
export function useSeedUnreadGames(gameIds: readonly string[]) {
  const store = use(ActivityContext)
  const key = gameIds.join(",")

  useEffect(() => {
    store?.seedUnread(key ? key.split(",") : [])
  }, [key, store])
}

function noopSubscribe() {
  return () => {}
}
