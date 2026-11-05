"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"

import { useMessageScroller } from "@workspace/ui/components/message-scroller"

import { useRunJump } from "@/components/chat/use-run-jump"
import {
  findTextSpan,
  pendingMessageJump,
  settleMessageJump,
  subscribeMessageJump,
  type MessageJump,
} from "@/lib/games/message-jump"

/** The `::highlight()` name the matched text is painted with, in `globals.css`. */
const HIGHLIGHT_NAME = "message-search-hit"

/** Past this the thread opens where it would anyway, rather than stay hidden. */
const MAX_JUMP_WAIT_MS = 8000

/** How far down the viewport the match lands, so the lines before it give context. */
const MATCH_VIEWPORT_FRACTION = 1 / 3

/**
 * Acts on a palette message hit for this thread: brings the message onto the
 * page, scrolls the matched text into view and highlights it until the
 * reader clicks or types. `onSettled` runs once the jump landed or gave up.
 *
 * Must render inside `MessageScrollerProvider`, as an overlay outside
 * `MessageScrollerContent` like the earlier-page loader. Renders nothing.
 */
export function SearchJump({
  gameId,
  runs,
  loadDownTo,
  hasEarlier,
  loadingEarlier,
  loadFailed,
  onSettled,
}: {
  gameId: string
  runs: readonly { id: string; messages: readonly { id: string }[] }[]
  loadDownTo: (position: number) => void
  hasEarlier: boolean
  loadingEarlier: boolean
  loadFailed: boolean
  onSettled: () => void
}) {
  const request = useSyncExternalStore(
    subscribeMessageJump,
    () => pendingMessageJump(gameId),
    () => null
  )
  const { scrollToMessage } = useMessageScroller()
  const jump = useRunJump({
    runs,
    loadDownTo,
    hasEarlier,
    loadingEarlier,
    loadFailed,
  })
  const handled = useRef<MessageJump | null>(null)
  const onSettledRef = useRef(onSettled)

  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  useEffect(() => {
    if (!request || handled.current === request) return
    handled.current = request

    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      clearTimeout(giveUp)
      settleMessageJump(request)
      onSettledRef.current()
    }
    /** The thread is hidden until the jump lands, so it must never wait forever. */
    const giveUp = setTimeout(settle, MAX_JUMP_WAIT_MS)

    jump({
      messageId: request.messageId,
      position: request.position,
      arrive: (runId) => {
        /** After the scroller's own first placement, which runs as the rows mount. */
        requestAnimationFrame(() => {
          scrollToMessage(runId, { align: "start", behavior: "auto" })
          revealMatch(runId, request.query)
          settle()
        })
      },
      miss: settle,
    })
  }, [jump, request, scrollToMessage])

  useEffect(() => clearHighlight, [])

  return null
}

/**
 * Highlights the first visible occurrence of `query` in the row and scrolls
 * it to a third of the way down the viewport. A row whose rendered text
 * differs from the stored one — markdown syntax the search saw but the page
 * does not show — keeps the row-start position with nothing highlighted.
 */
function revealMatch(runId: string, query: string) {
  const row = document.querySelector<HTMLElement>(
    `[data-slot="message-scroller-viewport"] [data-message-id="${CSS.escape(runId)}"]`
  )
  const viewport = row?.closest<HTMLElement>(
    '[data-slot="message-scroller-viewport"]'
  )
  if (!row || !viewport) return

  const range = matchRange(row, query)
  if (!range) return

  const matchTop = range.getBoundingClientRect().top
  const viewportTop = viewport.getBoundingClientRect().top
  viewport.scrollTop +=
    matchTop - viewportTop - viewport.clientHeight * MATCH_VIEWPORT_FRACTION

  if (typeof Highlight === "undefined" || !CSS.highlights) return

  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range))
  /** Like a browser's find bar: the mark stays until the reader acts. */
  const options = { capture: true, once: true } as const
  const clear = () => {
    clearHighlight()
    document.removeEventListener("pointerdown", clear, options)
    document.removeEventListener("keydown", clear, options)
  }
  document.addEventListener("pointerdown", clear, options)
  document.addEventListener("keydown", clear, options)
}

function clearHighlight() {
  if (typeof CSS !== "undefined" && CSS.highlights) {
    CSS.highlights.delete(HIGHLIGHT_NAME)
  }
}

/** A DOM range over `query` in the row's visible text, or `null` when it is not there. */
function matchRange(row: HTMLElement, query: string): Range | null {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if (parent && isVisible(parent)) nodes.push(node as Text)
  }

  const span = findTextSpan(
    nodes.map((node) => node.data),
    query
  )
  if (!span) return null

  const range = document.createRange()
  range.setStart(nodes[span.start.node]!, span.start.offset)
  range.setEnd(nodes[span.end.node]!, span.end.offset)
  return range
}

/** Collapsed tool output and closed reasoning hold text too, but none a reader can see. */
function isVisible(element: HTMLElement): boolean {
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : element.getClientRects().length > 0
}
