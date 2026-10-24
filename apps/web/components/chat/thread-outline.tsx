"use client"

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { useTranslations } from "next-intl"
import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@workspace/ui/components/message-scroller"
import { cn } from "@workspace/ui/lib/utils"

import {
  currentTurnId,
  outlineHasPersistentGutter,
  outlineHeightStyle,
  outlineHitStripWidth,
  outlineIndexFromPointer,
  outlineInteractiveWidth,
  outlineTopPercent,
  outlineTurns,
  previewText,
  type OutlineRun,
  type OutlineTurn,
} from "@/lib/games/thread-outline"

/** A release outside the window can skip `mouseup`, so the next button-free `mousemove` counts too. */
function onMouseButtonsReleased(onRelease: () => void): () => void {
  const check = (event: MouseEvent) => {
    if (event.buttons !== 0) return
    stop()
    onRelease()
  }
  const stop = () => {
    window.removeEventListener("mouseup", check)
    window.removeEventListener("mousemove", check)
  }
  window.addEventListener("mouseup", check)
  window.addEventListener("mousemove", check)
  return stop
}

/** Hands a wheel turn over the rail to the thread, so the rail never traps scrolling. */
function forwardWheel(event: WheelEvent, viewport: HTMLElement) {
  if (event.defaultPrevented || event.ctrlKey || event.deltaY === 0) return
  event.preventDefault()

  const forwarded = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    clientX: event.clientX,
    clientY: event.clientY,
  })
  if (!viewport.dispatchEvent(forwarded)) return

  const pixelsPerUnit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? viewport.clientHeight
        : 1
  viewport.scrollBy({ top: event.deltaY * pixelsPerUnit })
}

/**
 * The thread's jump menu, after t3code's timeline minimap: a short mark per
 * player message that fans out around the pointer, the turns on screen drawn
 * brighter, and a glass card with the turn's prompt and reply while one is
 * hovered.
 *
 * It sits in the free space beside the thread, so it stays visible only while
 * that space is at least 48px wide and otherwise fades in on hover; with none
 * at all (a narrow pane, the side panel open) it steps out of the way.
 *
 * Must render inside `MessageScrollerProvider`. Subscribing to visibility is
 * what turns row tracking on, so the caller only mounts this once there is
 * more than one turn to move between.
 */
export function ThreadOutline({ runs }: { runs: OutlineRun[] }) {
  const t = useTranslations("ChatActivity")
  const { scrollToMessage } = useMessageScroller()
  const { visibleMessageIds } = useMessageScrollerVisibility()
  const turns = outlineTurns(runs)
  const current = currentTurnId(runs, visibleMessageIds)
  const currentIndex = turns.findIndex((turn) => turn.id === current)
  const inView = new Set(visibleMessageIds)

  const rootRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hasPersistentGutter, setHasPersistentGutter] = useState(false)
  const [hitStripWidth, setHitStripWidth] = useState(0)
  const [passThrough, setPassThrough] = useState(false)
  const pressedOnStripRef = useRef(false)

  /** The free space beside the thread is the pane's width minus the thread's own, so both are measured. */
  useEffect(() => {
    const pane = rootRef.current?.parentElement
    if (!pane) return

    const measure = () => {
      const viewportWidth = pane.getBoundingClientRect().width
      const contentWidth =
        pane
          .querySelector<HTMLElement>('[data-slot="message-scroller-content"]')
          ?.getBoundingClientRect().width ?? viewportWidth
      setHasPersistentGutter(
        outlineHasPersistentGutter(viewportWidth, contentWidth)
      )
      setHitStripWidth(outlineHitStripWidth(viewportWidth, contentWidth))
    }

    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const viewport = root?.parentElement?.querySelector<HTMLElement>(
      '[data-slot="message-scroller-viewport"]'
    )
    if (!root || !viewport) return

    const onWheel = (event: WheelEvent) => forwardWheel(event, viewport)
    root.addEventListener("wheel", onWheel, { passive: false })
    return () => root.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    if (!passThrough) return
    return onMouseButtonsReleased(() => setPassThrough(false))
  }, [passThrough])

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < turns.length ? activeIndex : null
  const activeTurn =
    resolvedActiveIndex === null ? null : (turns[resolvedActiveIndex] ?? null)

  function select(turn: OutlineTurn) {
    scrollToMessage(turn.id, {
      align: "start",
      scrollMargin: 24,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    })
  }

  function indexFromPointer(event: ReactMouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return outlineIndexFromPointer({
      itemCount: turns.length,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: event.clientY,
    })
  }

  function moveActiveIndex(delta: number) {
    setActiveIndex((index) =>
      Math.max(0, Math.min(turns.length - 1, (index ?? 0) + delta))
    )
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/outline pointer-events-none absolute inset-y-0 right-0 z-40 hidden w-18 [@media(pointer:fine)]:block",
        hasPersistentGutter
          ? "opacity-100"
          : "opacity-0 transition-opacity duration-150 focus-within:opacity-100 hover:opacity-100"
      )}
    >
      <div className="relative h-full w-full select-none">
        <div
          className={cn(
            "absolute top-1/2 right-3 -translate-y-1/2",
            hitStripWidth > 0 && !passThrough
              ? "pointer-events-auto"
              : "pointer-events-none"
          )}
          onMouseDown={() => {
            if (pressedOnStripRef.current) return
            pressedOnStripRef.current = true
            onMouseButtonsReleased(() => {
              pressedOnStripRef.current = false
            })
          }}
          onMouseMove={(event) => {
            if (event.buttons !== 0 && !pressedOnStripRef.current)
              setPassThrough(true)
          }}
          style={{
            height: outlineHeightStyle(turns.length),
            width: outlineInteractiveWidth(hitStripWidth, activeTurn !== null),
          }}
        >
          <button
            type="button"
            aria-label={t("jumpToTurn", {
              text: activeTurn?.text || t("untitledTurn"),
            })}
            className="absolute inset-y-0 right-0 w-full cursor-pointer bg-transparent focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none focus-visible:ring-inset"
            onBlur={() => setActiveIndex(null)}
            onFocus={() =>
              setActiveIndex((index) => index ?? Math.max(currentIndex, 0))
            }
            onMouseLeave={() => setActiveIndex(null)}
            onMouseDown={(event) => {
              if (!(event.target as Element).closest("[data-outline-preview]"))
                event.preventDefault()
            }}
            onMouseMove={(event) => {
              if (event.buttons !== 0 && !pressedOnStripRef.current) return
              setActiveIndex(indexFromPointer(event))
            }}
            onClick={(event) => {
              if ((event.target as Element).closest("[data-outline-preview]"))
                return
              const index = indexFromPointer(event)
              const turn = index === null ? null : (turns[index] ?? null)
              if (turn) select(turn)
              event.currentTarget.blur()
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                moveActiveIndex(1)
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                moveActiveIndex(-1)
              } else if (event.key === "Home") {
                event.preventDefault()
                setActiveIndex(0)
              } else if (event.key === "End") {
                event.preventDefault()
                setActiveIndex(turns.length - 1)
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                if (activeTurn) select(activeTurn)
              }
            }}
          >
            <div className="absolute top-0 right-3 h-full w-px bg-border/15" />
            {turns.map((turn, index) => {
              const distance =
                resolvedActiveIndex === null
                  ? null
                  : Math.abs(index - resolvedActiveIndex)
              return (
                /* Only transform and opacity animate: the in-view state and the fisheye change on every scroll tick. */
                <span
                  key={turn.id}
                  aria-hidden="true"
                  data-in-view={inView.has(turn.id)}
                  className={cn(
                    "group/strip pointer-events-none absolute right-0 h-0.5 w-6 origin-right -translate-y-1/2 rounded-full transition-transform duration-150",
                    distance === 0
                      ? "bg-muted-foreground/75"
                      : "bg-muted-foreground/35",
                    distance === 0
                      ? "scale-x-100"
                      : distance === 1
                        ? "scale-x-[0.667]"
                        : distance === 2
                          ? "scale-x-[0.417]"
                          : "scale-x-[0.333]"
                  )}
                  style={{
                    top: `${outlineTopPercent(index, turns.length)}%`,
                  }}
                >
                  <span className="absolute inset-0 rounded-full bg-foreground/90 opacity-0 transition-opacity duration-150 group-data-[in-view=true]/strip:opacity-100" />
                </span>
              )
            })}
            {activeTurn ? (
              <Preview
                turn={activeTurn}
                topPercent={outlineTopPercent(
                  resolvedActiveIndex ?? 0,
                  turns.length
                )}
                translate={
                  resolvedActiveIndex === 0
                    ? "0%"
                    : resolvedActiveIndex === turns.length - 1
                      ? "-100%"
                      : "-50%"
                }
                fallback={t("untitledTurn")}
              />
            ) : null}
          </button>
        </div>
      </div>
    </div>
  )
}

function Preview({
  turn,
  topPercent,
  translate,
  fallback,
}: {
  turn: OutlineTurn
  topPercent: number
  translate: string
  fallback: string
}) {
  const reply = previewText(turn.assistantText)

  return (
    <span
      data-outline-preview
      className="pointer-events-auto absolute right-8 w-80 cursor-text select-text"
      onMouseMove={(event) => event.stopPropagation()}
      style={{ top: `${topPercent}%`, transform: `translateY(${translate})` }}
    >
      <span className="block rounded-xl border border-foreground/10 bg-popover/80 p-3 text-left text-popover-foreground shadow-xl shadow-black/25 backdrop-blur-xl backdrop-saturate-150">
        <span className="block max-w-full truncate text-sm leading-5 font-medium">
          {previewText(turn.text) ?? fallback}
        </span>
        {reply ? (
          <span
            className="mt-1 max-h-15 overflow-hidden text-sm leading-5 text-muted-foreground"
            // A span clamps only as a -webkit-box, which a `display` utility would override.
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
            }}
          >
            {reply}
          </span>
        ) : null}
      </span>
    </span>
  )
}
