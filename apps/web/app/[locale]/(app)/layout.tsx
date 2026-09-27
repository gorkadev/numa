import { Suspense } from "react"

import { cookies } from "next/headers"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
} from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { AppSettings } from "@/components/app-settings"
import { LocalizedSidebarProvider } from "@/components/localized-sidebar-provider"
import { AppSidebar } from "@/components/app-sidebar"
import { listGames } from "@/lib/games/queries"
import { ensureBillingCustomer } from "@/lib/polar/customers"
import { summarizeBillingState } from "@/lib/polar/plan"
import { POLAR_PRODUCT_PRO_ID } from "@/lib/polar/products"
import { requireSession } from "@/lib/session"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Suspense fallback={<AuthenticatedShellFallback />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  )
}

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  /**
   * Provision billing before rendering an interactive route. A user can then
   * create a game as soon as the route hydrates without racing the customer and
   * free-plan setup that authorizes their first turn.
   */
  const [cookieStore, billingState] = await Promise.all([
    cookies(),
    ensureBillingCustomer(),
    requireSession(),
  ])
  const billing = summarizeBillingState(billingState)
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <LocalizedSidebarProvider defaultOpen={defaultOpen}>
      <Suspense fallback={<SidebarFallback />}>
        <AuthenticatedSidebar billing={billing} />
      </Suspense>
      <SidebarInset>{children}</SidebarInset>
      <AppSettings billing={billing} />
    </LocalizedSidebarProvider>
  )
}

async function AuthenticatedSidebar({
  billing,
}: {
  billing: ReturnType<typeof summarizeBillingState>
}) {
  /**
   * The game list is the only remaining slow shell concern. Keeping it in its
   * own boundary lets the route content render after billing is ready while the
   * sidebar replaces its geometry-preserving fallback independently.
   */
  const games = await listGames()

  return (
    <AppSidebar
      games={games}
      billing={billing}
      upgradeHref={`/checkout?products=${POLAR_PRODUCT_PRO_ID}`}
    />
  )
}

function SidebarFallback() {
  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="size-7" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-3 w-14" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-8 w-11/12" />
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-8 w-full" />
      </SidebarFooter>
    </Sidebar>
  )
}

function AuthenticatedShellFallback() {
  return (
    <LocalizedSidebarProvider>
      <SidebarFallback />
      <SidebarInset>
        <div className="flex min-h-svh flex-col gap-6 p-6 md:p-10">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-40 w-full max-w-3xl" />
        </div>
      </SidebarInset>
    </LocalizedSidebarProvider>
  )
}
