"use client"

import { useEffect } from "react"

type ComposerShortcutState = {
  phase: "idle" | "recording" | "finishing"
  supported: boolean | null
  pending: boolean
  modelOpen: boolean
  pickerAvailable: boolean
  templatePickerAvailable: boolean
}

type ComposerShortcuts = ComposerShortcutState & {
  start: () => void
  stop: () => void
  discard: () => void
  setModelOpen: (open: boolean) => void
  setTemplateOpen: (open: boolean) => void
}

type ShortcutEvent = Pick<KeyboardEvent,
  "code" | "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" |
  "repeat" | "isComposing" | "defaultPrevented"
>

/** Returns an action only when the browser's default may be intercepted. */
export function getComposerShortcutAction(
  event: ShortcutEvent,
  state: ComposerShortcutState,
  inOverlay: boolean,
): "start" | "stop" | "discard" | "model" | "template" | null {
  if (event.repeat || event.isComposing || event.defaultPrevented || inOverlay) return null
  const exactChord = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
  if (event.code === "KeyD" && exactChord) {
    if (state.phase === "finishing") return null
    if (state.phase === "idle" && (state.supported === false || state.pending)) return null
    return state.phase === "recording" ? "stop" : "start"
  }
  if (
    event.key === "Escape" && !event.ctrlKey && !event.shiftKey &&
    !event.altKey && !event.metaKey && state.phase !== "idle" && !state.modelOpen
  ) return "discard"
  if (event.code === "KeyM" && exactChord && state.pickerAvailable) return "model"
  if (
    event.code === "KeyV" && exactChord && state.templatePickerAvailable &&
    !state.pending && state.phase === "idle"
  ) return "template"
  return null
}

export function useComposerShortcuts({
  phase, supported, pending, modelOpen, pickerAvailable, templatePickerAvailable,
  start, stop, discard, setModelOpen, setTemplateOpen,
}: ComposerShortcuts) {
  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      const target = event.target
      const inOverlay =
        (target instanceof Element &&
          Boolean(target.closest('[role="dialog"], [role="menu"]'))) ||
        Boolean(
          document.querySelector(
            '[role="dialog"][data-open], [role="dialog"][data-state="open"], [role="menu"][data-open], [role="menu"][data-state="open"]'
          )
        )
      const action = getComposerShortcutAction(event, {
        phase, supported, pending, modelOpen, pickerAvailable, templatePickerAvailable,
      }, inOverlay)
      if (!action) return
      event.preventDefault()
      if (action === "start") start()
      else if (action === "stop") stop()
      else if (action === "discard") discard()
      else if (action === "model") setModelOpen(true)
      else setTemplateOpen(true)
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [
    phase, supported, pending, pickerAvailable, templatePickerAvailable,
    modelOpen, start, stop, discard, setModelOpen, setTemplateOpen,
  ])
}
