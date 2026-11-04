"use client"

import { useEffect, useEffectEvent, useRef } from "react"

/**
 * The nearest ancestor that scrolls vertically, which is the box the sentinel
 * has to be measured against: with the viewport as the root, `rootMargin`
 * would reach past the list's own clipped edge and never trigger early.
 */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") return node
  }
  return null
}

/**
 * An invisible marker at the end of a scrolling list that calls `onReach`
 * once it comes within `margin` of the visible area, so the next page is
 * already loading before the reader gets there. It observes again whenever
 * `enabled` turns back on, which is how one page leads to the next.
 */
export function LoadMoreSentinel({
  onReach,
  enabled,
  margin = 400,
}: {
  onReach: () => void
  enabled: boolean
  margin?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reach = useEffectEvent(onReach)

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) reach()
      },
      { root: scrollParentOf(element), rootMargin: `0px 0px ${margin}px 0px` }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled, margin])

  return <div ref={ref} aria-hidden className="h-px shrink-0" />
}
