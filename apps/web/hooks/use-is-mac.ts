"use client"

import { useSyncExternalStore } from "react"

/**
 * A subscription that never fires, because the platform cannot change under a
 * running tab. `useSyncExternalStore` still needs one.
 */
const noSubscribe = () => () => {}

/**
 * Whether the running platform spells its modifiers the Apple way.
 *
 * Read through `useSyncExternalStore` rather than in an effect: the server has
 * no platform to ask, so the server snapshot is the portable answer and the
 * client's is whatever the browser reports. React swaps the two as part of
 * hydration, which is both warning-free and one render shorter than settling it
 * from an effect afterwards.
 *
 * Shared by every component that has to show a keyboard shortcut's platform
 * spelling — `app-sidebar.tsx`'s own chords and `nav-user.tsx`'s settings
 * shortcut hint both need the same answer, so it lives here once rather than
 * as two copies of the same `navigator.userAgent` sniff drifting apart.
 */
export function useIsMac() {
  return useSyncExternalStore(
    noSubscribe,
    () => /mac|iphone|ipad/i.test(navigator.userAgent),
    () => false
  )
}
