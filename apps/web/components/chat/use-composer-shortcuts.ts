"use client"

import { useEffect } from "react"

type ComposerShortcuts = {
  phase: "idle" | "recording" | "finishing"
  supported: boolean | null
  pending: boolean
  modelOpen: boolean
  pickerAvailable: boolean
  start: () => void
  stop: () => void
  discard: () => void
  setModelOpen: (open: boolean) => void
}

export function useComposerShortcuts({
  phase,
  supported,
  pending,
  modelOpen,
  pickerAvailable,
  start,
  stop,
  discard,
  setModelOpen,
}: ComposerShortcuts) {
  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.isComposing || event.defaultPrevented) return
      const target = event.target
      const inOverlay =
        (target instanceof Element &&
          Boolean(target.closest('[role="dialog"], [role="menu"]'))) ||
        Boolean(
          document.querySelector(
            '[role="dialog"][data-open], [role="dialog"][data-state="open"], [role="menu"][data-open], [role="menu"][data-state="open"]'
          )
        )
      if (inOverlay) return
      const exactChord =
        event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
      if (event.code === "KeyD" && exactChord) {
        if (phase === "finishing") return
        if (phase === "idle" && (supported === false || pending)) return
        event.preventDefault()
        if (phase === "recording") stop()
        else start()
      } else if (
        event.key === "Escape" &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        phase !== "idle" &&
        !modelOpen
      ) {
        event.preventDefault()
        discard()
      } else if (event.code === "KeyM" && exactChord && pickerAvailable) {
        event.preventDefault()
        setModelOpen(true)
      }
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [
    phase,
    supported,
    pending,
    pickerAvailable,
    modelOpen,
    start,
    stop,
    discard,
    setModelOpen,
  ])
}
