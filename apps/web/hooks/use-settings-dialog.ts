"use client"

import { useCallback } from "react"

import { usePathname, useSearchParams } from "next/navigation"

import {
  DEFAULT_SECTION_ID,
  isSectionId,
  type SectionId,
} from "@/lib/settings/sections"

/** The query param the dialog's open state and section live in. */
const SETTINGS_PARAM = "settings"

/**
 * The settings dialog's open state and active section, addressed entirely
 * through the URL's `?settings=` query param instead of a `useState`
 * anywhere.
 *
 * The dialog has to open identically from two places that do not share a
 * convenient parent: `NavUser`'s dropdown item, which lives inside the
 * mobile sidebar's own `Drawer` and unmounts with it, and the global
 * Cmd/Ctrl+Shift+, shortcut, which has to work from every screen —
 * `components/app-settings.tsx` mounts both the dialog and the shortcut
 * listener once, at the `(app)` layout level, precisely so neither depends
 * on the sidebar being open. A `useState` owned by either side would leave
 * the other unable to open or close it; the URL is the one piece of state
 * both can read and write without duplicating the other's copy and drifting
 * out of sync — calling this hook from more than one component always
 * reads the same answer, because there is only one source of truth to read.
 *
 * The URL is rewritten with `window.history.replaceState` rather than
 * `router.replace`. Next integrates the native History methods with its own
 * router, so `useSearchParams` still re-renders on the change (see the
 * "Linking and Navigating" guide in `next/dist/docs`), but no RSC request
 * is made — and the pages this dialog opens over are not cheap to
 * re-render: `/games/[id]` would re-run its own database reads on every
 * open, close and section click. Replace rather than push because opening
 * settings is a UI toggle, not a back-button stop: one history entry per
 * click would mean pressing "back" repeatedly just to leave the page.
 */
export function useSettingsDialog() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const rawSection = searchParams.get(SETTINGS_PARAM)
  const open = rawSection !== null
  const section = isSectionId(rawSection) ? rawSection : DEFAULT_SECTION_ID

  /**
   * Every other query param on the current URL is carried forward
   * unchanged — this dialog is a layer on top of whatever page it was
   * opened from, not a navigation away from it.
   */
  const navigate = useCallback(
    (nextSection: SectionId | null) => {
      const params = new URLSearchParams(searchParams.toString())

      if (nextSection === null) {
        params.delete(SETTINGS_PARAM)
      } else {
        params.set(SETTINGS_PARAM, nextSection)
      }

      const query = params.toString()
      window.history.replaceState(
        null,
        "",
        `${pathname}${query ? `?${query}` : ""}`
      )
    },
    [pathname, searchParams]
  )

  const openSettings = useCallback(
    (nextSection: SectionId = DEFAULT_SECTION_ID) => navigate(nextSection),
    [navigate]
  )

  const closeSettings = useCallback(() => navigate(null), [navigate])

  const setSection = useCallback(
    (nextSection: SectionId) => navigate(nextSection),
    [navigate]
  )

  const toggleSettings = useCallback(() => {
    if (open) {
      closeSettings()
    } else {
      openSettings()
    }
  }, [open, openSettings, closeSettings])

  return {
    open,
    section,
    openSettings,
    closeSettings,
    setSection,
    toggleSettings,
  }
}
