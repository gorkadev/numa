import { cookies } from "next/headers"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { AppSidebar } from "@/components/app-sidebar"
import { listGames } from "@/lib/games/queries"
import { ensureBillingCustomer } from "@/lib/polar/customers"
import { summarizeBillingState } from "@/lib/polar/plan"
import { POLAR_PRODUCT_PRO_ID } from "@/lib/polar/products"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  /**
   * Billing is provisioned HERE, in the shell that wraps every authenticated
   * page, rather than at the moment an organization first spends money.
   *
   * The narrow version of this — provision on the first game — leaves out
   * everyone who does not create one: every organization that existed before
   * the provisioning code did, and every user who opens a game somebody else
   * created. Those organizations have no customer, no free plan and no credits,
   * so the gate in `trigger/chat.ts` refuses every turn, and nothing in the UI
   * offers a way out of it. Opening the application is the one thing every such
   * organization definitely does, which is what makes this the right hook. See
   * `ensureBillingCustomer` for why it is safe to write from a render and why a
   * Clerk webhook is not an option here.
   *
   * It returns the customer state it settled on, so the summary the sidebar
   * renders is derived from that same document instead of fetched again:
   * `getBillingSummary` would read `getStateExternal` a second time on every
   * navigation for fields this already has. One Polar call on the ordinary,
   * already-provisioned path.
   */
  const [games, billingState, cookieStore] = await Promise.all([
    listGames(),
    ensureBillingCustomer(),
    cookies(),
  ])

  const billing = summarizeBillingState(billingState)

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
      {/**
       * The upgrade link is assembled here rather than in the sidebar because
       * `POLAR_PRODUCT_PRO_ID` carries no `NEXT_PUBLIC_` prefix: it exists on
       * the server and nowhere else. A client component reading it would get
       * `undefined` and render a checkout link that 400s after the click, which
       * is the failure mode this prop exists to make impossible.
       */}
      <AppSidebar
        games={games}
        billing={billing}
        upgradeHref={`/checkout?products=${POLAR_PRODUCT_PRO_ID}`}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
