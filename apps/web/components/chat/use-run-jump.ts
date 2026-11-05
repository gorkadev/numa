"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { runIdContaining } from "@/lib/games/message-jump"

export type RunJumpTarget = {
  messageId: string
  /** The message's position in the thread; without one, only a loaded message can be reached. */
  position?: number
  /** Called with the row holding the message, once it is rendered. */
  arrive: (runId: string) => void
  /** Called when the message cannot be reached: the load failed or it is not in the thread. */
  miss?: () => void
}

type JumpRun = { id: string; messages: readonly { id: string }[] }

type Waiting = RunJumpTarget & { sawLoad: boolean }

/**
 * Brings a message's row onto the page, loading history back to its position
 * when it is not loaded yet, then hands the row to `arrive`. Shared by the
 * thread outline and the palette's message hits, so both wait for a page the
 * same way.
 */
export function useRunJump({
  runs,
  loadDownTo,
  hasEarlier,
  loadingEarlier,
  loadFailed,
}: {
  runs: readonly JumpRun[]
  loadDownTo: (position: number) => void
  hasEarlier: boolean
  loadingEarlier: boolean
  loadFailed: boolean
}) {
  const runsRef = useRef(runs)
  const targetRef = useRef<Waiting | null>(null)
  /** Re-runs the wait below after a request, whose target lives in a ref. */
  const [requested, setRequested] = useState(0)

  useEffect(() => {
    runsRef.current = runs
  }, [runs])

  const jump = useCallback(
    (target: RunJumpTarget) => {
      const runId = runIdContaining(runsRef.current, target.messageId)
      if (runId) {
        targetRef.current = null
        target.arrive(runId)
        return
      }

      if (target.position === undefined) {
        target.miss?.()
        return
      }

      targetRef.current = { ...target, sawLoad: false }
      setRequested((count) => count + 1)
      loadDownTo(target.position)
    },
    [loadDownTo]
  )

  useEffect(() => {
    const target = targetRef.current
    if (!target) return

    const runId = runIdContaining(runs, target.messageId)
    if (runId) {
      targetRef.current = null
      /** A frame later, so the row is measured and the prepend has been compensated. */
      requestAnimationFrame(() => target.arrive(runId))
      return
    }

    if (loadingEarlier) {
      target.sawLoad = true
      return
    }

    /**
     * Still missing with no load running: the load ran and stopped short of
     * it, or failed, or there is no history left to load. Only a load seen
     * running counts as finished — an effect can run again before the render
     * that shows the load starting, as Strict Mode does on mount.
     */
    if (loadFailed || !hasEarlier || target.sawLoad) {
      targetRef.current = null
      target.miss?.()
    }
  }, [hasEarlier, loadFailed, loadingEarlier, requested, runs])

  return jump
}
