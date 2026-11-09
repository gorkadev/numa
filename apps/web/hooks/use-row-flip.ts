"use client"

import { useLayoutEffect } from "react"

/**
 * FLIP for the sidebar's game rows, played only when a sent message moves a
 * game to the top: `captureRowPositions` records where every visible row
 * stood just before that reorder, and `useRowFlip` slides each row from there
 * to its new place once React has rendered it. Any other reorder (loading a
 * page, switching the sort, a server refresh) captures nothing, so it does
 * not animate.
 */

const ROW_SELECTOR = "[data-flip-row]"

/** Strong ease-in-out: the rows move on screen, they neither enter nor leave. */
const EASING = "cubic-bezier(0.77, 0, 0.175, 1)"
const DURATION_MS = 250

let captured: Map<string, number> | null = null

/** The rows actually laid out: a hidden list (the collapsed rail's copy) has no box. */
function visibleRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)].filter(
    (row) => row.offsetParent !== null
  )
}

export function captureRowPositions() {
  if (typeof document === "undefined") return

  captured = new Map(
    visibleRows().map((row) => [row.dataset.flipRow!, row.getBoundingClientRect().top])
  )
}

/** Runs after every render where `rows` changed; plays only a captured reorder. */
export function useRowFlip(rows: unknown) {
  useLayoutEffect(() => {
    const before = captured
    captured = null
    if (!before) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    for (const row of visibleRows()) {
      const from = before.get(row.dataset.flipRow!)
      if (from === undefined) continue

      const delta = from - row.getBoundingClientRect().top
      if (Math.abs(delta) < 1) continue

      row.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
        { duration: DURATION_MS, easing: EASING }
      )
    }
  }, [rows])
}
