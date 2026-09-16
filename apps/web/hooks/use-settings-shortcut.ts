"use client"

import { useEffect } from "react"

/**
 * Cmd+Shift+, on Mac, Ctrl+Shift+, elsewhere — bound on `window`, the same
 * way `app-sidebar.tsx`'s own chords are, so it fires from anywhere in the
 * app including from inside the chat composer, not only when some specific
 * control happens to have focus.
 *
 * Matched on `event.code === "Comma"` rather than `event.key`, for the same
 * reason `app-sidebar.tsx`'s comment on its own chords gives: holding Shift
 * turns `key` into `"<"` on a US layout and into something else again on
 * other layouts, while `code` names the physical Comma key regardless of
 * what the layout maps it to.
 */
export function useSettingsShortcut(onTrigger: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
      if (event.code !== "Comma") return

      event.preventDefault()
      onTrigger()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onTrigger])
}
