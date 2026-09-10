import { NextResponse } from "next/server"

import { getBillingSummary } from "@/lib/polar/plan"

/**
 * The current organization's plan and credit balance, for a client that
 * already has the page and only needs the number again.
 *
 * # Why an endpoint and not a server action
 *
 * Both would work. This is a read with no side effect, called on a timer and
 * on window focus, and a `GET` is what that is: cacheable-by-nature semantics,
 * cancellable with an `AbortSignal`, and visible as one line in the network
 * tab when somebody asks why the balance is wrong. A server action would POST
 * to the page route and re-render the tree to deliver two fields.
 *
 * # Why it cannot be cached
 *
 * A credit balance that a proxy is allowed to hold for even a few seconds is a
 * balance that lies to the user immediately after the turn they just spent. It
 * is also per-organization, so a shared cache entry would be a cross-tenant
 * leak rather than merely stale. `dynamic` states the first, the header
 * states the second, and `getBillingSummary` reads the org from the session on
 * every call.
 *
 * # Why there is no auth check here
 *
 * There is one, it just lives in `getBillingSummary`: it reads `orgId` from
 * Clerk's `auth()` and answers `{ plan: "none", balance: null }` when there is
 * none. An unauthenticated caller therefore learns nothing about anybody, and
 * no caller can ask about an organization other than its own — the identity is
 * taken from the session, never from the request.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(await getBillingSummary(), {
    headers: { "cache-control": "no-store, private" },
  })
}
