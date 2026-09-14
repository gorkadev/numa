"use client"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The only way to open the sidebar below the `md` breakpoint.
 *
 * On desktop the sidebar (or its icon rail, `collapsible="icon"`) is always
 * on screen, so `app-sidebar.tsx`'s own header trigger is reachable from
 * every page. Below `md` the sidebar renders as an off-canvas drawer that
 * starts closed (`sidebar.tsx`'s `isMobile` branch) — a page with no header
 * of its own, or a header that never carried the sidebar's trigger, left a
 * phone-width visitor with no way back to it at all. `md:hidden` mirrors
 * `useIsMobile`'s own 768px breakpoint so this button and the drawer it
 * opens appear and disappear at the same width, and it costs nothing on the
 * server-rendered markup — no client-only check that would otherwise flash
 * between renders.
 */
export function MobileSidebarTrigger({ className }: { className?: string }) {
  return <SidebarTrigger className={cn("md:hidden", className)} />
}
