import { cookies } from "next/headers"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { AppSidebar } from "@/components/app-sidebar"
import { listGames } from "@/lib/games/queries"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [games, cookieStore] = await Promise.all([listGames(), cookies()])

  /**
   * `SidebarProvider` already writes this cookie on every toggle; nobody was
   * reading it back, which is why the sidebar reopened on each load. A cookie
   * rather than `localStorage` because this layout renders on the server: the
   * collapsed state is known before the first paint, so the sidebar never
   * flashes open and then snaps shut the way a client-only store would make it.
   */
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar games={games} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
