"use client"

import { Suspense, useState } from "react"
import dynamic from "next/dynamic"

import { useSettingsDialog } from "@/hooks/use-settings-dialog"
import { useSettingsShortcut } from "@/hooks/use-settings-shortcut"
import type { BillingSummary } from "@/lib/polar/plan"

/**
 * Loaded the first time the dialog opens: it is closed on almost every page
 * view, and its sections bring passkey, two-factor and billing code that no
 * other part of the app shell needs.
 */
const SettingsDialog = dynamic(
  () => import("@/components/settings-dialog").then((m) => m.SettingsDialog),
  { ssr: false }
)

function AppSettingsInner({ billing }: { billing: BillingSummary }) {
  const {
    open,
    section,
    focusSetting,
    clearFocusSetting,
    openSettings,
    closeSettings,
    setSection,
    toggleSettings,
  } = useSettingsDialog()

  useSettingsShortcut(toggleSettings)

  /** Stays mounted once opened, so closing plays its exit animation. */
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  if (!opened) return null

  return (
    <SettingsDialog
      open={open}
      onOpenChange={(nextOpen) =>
        nextOpen ? openSettings(section) : closeSettings()
      }
      section={section}
      onSectionChange={setSection}
      focusSetting={focusSetting}
      onFocusSettingHandled={clearFocusSetting}
      billing={billing}
    />
  )
}

/**
 * The settings dialog and its global keyboard shortcut, mounted exactly
 * once in `app/(app)/layout.tsx` — a sibling of `AppSidebar`, not a child of
 * it.
 *
 * This used to live inside `NavUser`, at the foot of the sidebar. That
 * works on desktop, where the sidebar is always in the DOM, but on a phone
 * width `packages/ui/src/components/sidebar.tsx` renders the sidebar's
 * entire content — `NavUser` included — inside its own mobile `Drawer`,
 * which unmounts its children while closed. A dialog and a shortcut
 * listener that only exist while a *different* drawer happens to be open
 * would make both useless everywhere except that one moment, and the
 * shortcut in particular is supposed to work from any page at any width.
 * Hoisting both up to the layout — always present, regardless of sidebar
 * state or viewport — is what makes `?settings=` deep links and the
 * Cmd/Ctrl+Shift+, chord work everywhere.
 *
 * `useSearchParams` (inside `useSettingsDialog`) needs a `Suspense`
 * boundary above it to avoid the "Missing Suspense boundary" build error
 * for a statically rendered route — see that hook's own docs. `AppLayout`
 * is already forced dynamic by its own `cookies()` read, so this never
 * actually suspends in practice; the boundary is here for correctness
 * rather than because a fallback is ever seen.
 */
export function AppSettings({ billing }: { billing: BillingSummary }) {
  return (
    <Suspense fallback={null}>
      <AppSettingsInner billing={billing} />
    </Suspense>
  )
}
