"use client"

import { useEffect, useRef, useState } from "react"

import { notFound, useParams, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"

import { ChatSkeleton } from "@/components/chat/chat-skeleton"
import { CodeWrapProvider } from "@/components/chat/code-wrap"
import { MessageAnimationProvider } from "@/components/chat/message-animation"
import { useGameWorking } from "@/components/game-activity-provider"
import { GameChat } from "@/components/game-chat"
import { isTierId, type TierId } from "@/lib/ai/model-catalog"
import { markOpenGameRead } from "@/lib/games/activity-actions"
import { parseAttachmentParts } from "@/lib/games/attachments"
import { gameRowQueryKey, type GameRow } from "@/lib/games/thread-page"

/** A 404 is an answer rather than a failure: the game is gone, or was never ours. */
async function fetchGameRow(gameId: string): Promise<GameRow | null> {
  const response = await fetch(`/api/games/${gameId}`)

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)

  return response.json() as Promise<GameRow>
}

/**
 * A game's page, drawn from what the browser holds. Keyed by the id so moving
 * between games starts clean even when this stays mounted across them.
 */
export function GameRoute({
  contextWindows,
  renderedAt,
}: {
  /** Each tier's orchestrator window, resolved on the server (see `strongContextWindows`). */
  contextWindows: Record<TierId, number>
  /** New on every server render; see the layout. */
  renderedAt: string
}) {
  const { id } = useParams<{ id?: string }>()

  if (!id) return null

  return (
    <GameEntry
      key={id}
      gameId={id}
      contextWindows={contextWindows}
      renderedAt={renderedAt}
    />
  )
}

/**
 * The prompt a game created from the home screen arrives with, because the
 * thread, not the create action, is what sends a message. Read once: the thread
 * clears the query string as soon as it has sent. A repeated key is not a prompt.
 */
function readInitialTurn(search: URLSearchParams) {
  const prompts = search.getAll("prompt")
  const initialPrompt = prompts.length === 1 ? prompts[0] : undefined
  const files = search.getAll("files")
  const tiers = search.getAll("tier")
  const tier = tiers.length === 1 ? tiers[0] : undefined

  return {
    initialPrompt,
    /** The files attached to that prompt, as references; only ours survive. */
    initialFiles:
      initialPrompt && files.length === 1 ? parseAttachmentParts(files[0]) : [],
    /**
     * Anything but a known tier is ignored rather than corrected: the thread
     * already starts on the default, so an edited URL simply does not move it.
     */
    initialTierId: isTierId(tier) ? tier : undefined,
  }
}

function GameEntry({
  gameId,
  contextWindows,
  renderedAt,
}: {
  gameId: string
  contextWindows: Record<TierId, number>
  renderedAt: string
}) {
  const client = useQueryClient()
  const search = useSearchParams()
  const [initialTurn] = useState(() => readInitialTurn(search))
  const working = useGameWorking(gameId)

  /**
   * Shown from cache at once and read again on every entry. The client's
   * default of keeping data forever fits the thread, not this: the row changes
   * between turns, in other tabs too. Only an entry, a finished turn or a server
   * refresh asks again, so a window regaining focus cannot disturb a reader.
   */
  const { data: row, isFetching, isError, refetch } = useQuery({
    queryKey: gameRowQueryKey(gameId),
    queryFn: () => fetchGameRow(gameId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const refresh = useRef({ renderedAt, working })

  useEffect(() => {
    const previous = refresh.current

    refresh.current = { renderedAt, working }

    if (previous.renderedAt !== renderedAt || (previous.working && !working)) {
      void client.invalidateQueries({ queryKey: gameRowQueryKey(gameId) })
    }
  }, [client, gameId, renderedAt, working])

  /**
   * Opening the game is what reads it, decided on the row just read: a cached
   * one can miss a turn. A failed write only leaves the unread dot showing, so
   * it must never take the page down with it.
   */
  const entryRead = useRef(false)

  useEffect(() => {
    if (entryRead.current || isFetching || isError || !row) return

    entryRead.current = true

    if (row.unread) {
      markOpenGameRead(gameId).catch((error: unknown) => {
        console.error("Failed to mark game as read", error)
      })
    }
  }, [gameId, isError, isFetching, row])

  /**
   * The first token stays: each read signs a new one, and a new URL would restart
   * the game running in the preview frame.
   */
  const [previewToken, setPreviewToken] = useState(row?.previewToken)

  if (!previewToken && row?.previewToken) setPreviewToken(row.previewToken)

  if (row === null) notFound()

  if (!row) {
    if (!isError) return <ChatSkeleton />

    return <GameLoadError onRetry={() => void refetch()} />
  }

  return (
    <CodeWrapProvider wrap={row.settings.wrapCodeBlocks}>
      <MessageAnimationProvider animation={row.settings.messageAnimation}>
      <GameChat
        gameId={gameId}
        title={row.title}
        pinned={row.pinned}
        templateId={row.templateId}
        previewToken={previewToken}
        lastTurnFinishedAt={row.lastTurnFinishedAt}
        rowSettled={!isFetching}
        initialSessions={
          row.session ? { [gameId]: row.session } : undefined
        }
        initialPrompt={initialTurn.initialPrompt}
        initialFiles={initialTurn.initialFiles}
        initialTierId={initialTurn.initialTierId}
        contextWindows={contextWindows}
        showSessionStats={row.settings.showSessionStats}
      />
      </MessageAnimationProvider>
    </CodeWrapProvider>
  )
}

/** A game whose row could not be read: the chat has nothing to show yet. */
export function GameLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("ChatActivity")

  return (
    <div className="flex h-svh flex-col items-center justify-center gap-2">
      <p role="alert" className="text-sm text-muted-foreground">
        {t("loadEarlierFailed")}
      </p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  )
}
