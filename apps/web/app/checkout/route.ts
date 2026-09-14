import { auth } from "@clerk/nextjs/server"

import { polar } from "@/lib/polar/client"
import { ensureBillingCustomer } from "@/lib/polar/customers"
import { activeSubscriptionsForProduct } from "@/lib/polar/plan"
import type { CustomerState } from "@/lib/polar/plan"
import {
  POLAR_PRODUCT_FREE_ID,
  POLAR_PRODUCT_PRO_ID,
  POLAR_PRODUCT_TOPUP_ID,
} from "@/lib/polar/products"

/**
 * The organization's customer state, or `null` if it could not be read.
 *
 * Every guard below needs the same document — whether Pro is already active,
 * which free subscription to hand Polar for an upgrade, whether a top-up may
 * be bought — so this is the one Polar call this route makes to decide any
 * of them, rather than each guard asking again.
 */
async function readCustomerState(orgId: string): Promise<CustomerState | null> {
  try {
    return await polar.customers.getStateExternal({ externalId: orgId })
  } catch (error) {
    console.error("Failed to read Polar customer state", error)

    return null
  }
}

/**
 * Whether this organization holds a PAID subscription.
 *
 * Specifically the Pro product, and not merely "any active subscription" —
 * which is the trap, because every organization gets one.
 * `ensureBillingCustomer` subscribes each org to the free plan the moment it
 * opens the application, so `activeSubscriptions.length > 0` is true for
 * literally everybody and a guard built on it blocks nobody. It would look like
 * a rule and behave like a comment.
 *
 * The rule that was actually wanted is that extra credits extend a plan rather
 * than replace one. Top-up credits carry `rollover: true` and never expire, so
 * a free user who can buy them repeatedly has found a pay-as-you-go product
 * nobody designed, at the price point with the worst margin and the least
 * predictable revenue — and the monthly plan becomes the option only the
 * inattentive choose.
 */
function hasActiveProduct(state: CustomerState, productId: string): boolean {
  return activeSubscriptionsForProduct(state, productId).length > 0
}

/**
 * Opens a Polar checkout for the products named in the query string and sends
 * the browser to it.
 *
 * The buyer is never taken from the request. The Clerk organization is derived
 * from the session and passed to Polar as `externalCustomerId`, exactly as
 * `lib/games/queries.ts` derives the `org_id` predicate it filters games by —
 * the tenant boundary is a property of who is asking, and a caller that could
 * name the organization it is paying for could name somebody else's.
 *
 * That field is the whole point of this route being authenticated. It is the
 * only thing that maps a Polar customer back to a tenant in this application:
 * Polar knows about orders and customers, this database knows about
 * organizations, and `externalCustomerId` is the single value that joins them.
 * Without it the money arrives, `order.paid` fires, and the webhook cannot
 * answer the only question that matters — which organization just paid — so the
 * payment can be neither credited nor reconciled, and the customer has been
 * charged for something this application cannot give them.
 */
export async function GET(request: Request): Promise<Response> {
  /**
   * `auth.protect()` rather than `auth()`: an anonymous browser landing here
   * should be sent to sign in and come back, which is what protect does, not
   * shown a JSON error it cannot act on.
   */
  const { orgId } = await auth.protect()

  /**
   * Signed in, but with no active organization. Elsewhere in this application
   * that is a benign state — `listGames` answers with an empty list, because a
   * user who owns no games owns no games.
   *
   * Here it is not benign, and it must not be papered over. There is no
   * personal account to fall back to: `games.orgId` is `notNull`, so an
   * organization is the only thing a purchase can belong to. Letting the
   * checkout through would take real money for a subscription with no owner —
   * strictly worse than refusing, because a refusal is a page the user can act
   * on and an unattributable payment is a support ticket and a refund.
   */
  if (!orgId) {
    return Response.json(
      { error: "An active organization is required to check out" },
      { status: 409 }
    )
  }

  const url = new URL(request.url)

  /**
   * `getAll`, because a Polar checkout can span several products the customer
   * then switches between — a single `get` would silently drop every id but the
   * first.
   */
  const products = url.searchParams.getAll("products")

  if (products.length === 0) {
    return Response.json(
      { error: "Missing products in query params" },
      { status: 400 }
    )
  }

  /**
   * The free plan is not a purchase, and it must never go through Polar's
   * checkout to get one.
   *
   * Two separate reasons, either one fatal on its own. First, a free plan
   * needs no payment, so a checkout session is pure friction — a page with a
   * card-number field in front of a product that costs nothing. Second, and
   * worse: a completed Polar checkout creates an `individual` customer for
   * whoever paid, which bypasses `ensureBillingCustomer` entirely and gives
   * the ORG nothing — no team customer, no `externalId` pointing at this
   * organization, none of the provisioning the rest of this integration
   * depends on. Routing "Get started" through `ensureBillingCustomer`
   * instead is what actually grants the org its plan, the same call the
   * application shell already makes on every render.
   */
  if (products.includes(POLAR_PRODUCT_FREE_ID)) {
    await ensureBillingCustomer()

    return Response.redirect(new URL("/", request.url), 302)
  }

  const state = await readCustomerState(orgId)

  /**
   * A top-up may only be bought on top of a subscription.
   *
   * The reason is the top-up's own terms rather than anything technical: its
   * credits carry `rollover: true`, so they never expire. That makes a
   * standalone top-up a strictly better deal than the monthly plan for anyone
   * who thinks about it for ten seconds — buy a pack, use it over however many
   * months it lasts, buy another when it runs out. Nobody is doing anything
   * wrong in that story, which is exactly the problem: the lower-margin,
   * lumpier, less predictable product wins by default, and the plan the
   * business is actually built on becomes the option only the inattentive pick.
   * The top-up is meant to be a release valve for a heavy month, not the
   * product.
   *
   * It is enforceable here precisely because this application mints the
   * checkout session rather than linking to a hosted one. Polar will happily
   * sell the product to anybody who reaches a checkout for it; the control is
   * that no such checkout ever comes into existence. Refusing here means there
   * is no URL to visit, no link to share, and nothing to bookmark from a
   * previous purchase — which a client-side guard, or a pricing page that
   * simply hides the button, would all fail to achieve.
   *
   * 409 rather than 403: the request is not forbidden, the account is in the
   * wrong state for it, and the fix is to subscribe first.
   *
   * Any failure answers "not allowed", and that direction is deliberate.
   * Everywhere else in this integration an unanswerable question is forgiven
   * — see the credit gate in `trigger/chat.ts` — because refusing there takes
   * away something the customer already paid for. Here the unanswerable
   * question is blocking a PURCHASE that has not happened yet, and a refused
   * checkout costs the buyer a retry rather than anything they own. Selling a
   * top-up we could not justify is the more expensive mistake, so this one
   * fails closed.
   */
  if (products.includes(POLAR_PRODUCT_TOPUP_ID)) {
    if (!state || !hasActiveProduct(state, POLAR_PRODUCT_PRO_ID)) {
      return Response.json(
        { error: "A paid plan is required to buy extra credits" },
        { status: 409 }
      )
    }
  }

  /**
   * Free-to-Pro upgrade in Polar, not a second subscription next to the
   * first.
   *
   * A checkout that names the Pro product for an org that already has an
   * active free subscription fails at Polar with "you already have an active
   * subscription" unless the checkout is told which subscription to upgrade
   * — `subscriptionId` on `CheckoutCreate`, valid only for a subscription
   * that is on a free price. Passing it is what turns this into the upgrade
   * it actually is. `activeSubscriptionsForProduct` is used rather than a
   * fresh Polar read because this function already fetched the same
   * document above; if more than one free subscription slipped through
   * before `dedupeFreeSubscriptions` cleaned it up, the oldest is the one
   * `ensureBillingCustomer` intends to keep, so it is the one offered here.
   *
   * An org that already holds an active Pro subscription is sent back to the
   * pricing page rather than into a doomed checkout — there is nothing left
   * to buy, and Polar's own rejection would be a worse way to say so.
   */
  let subscriptionId: string | undefined

  if (products.includes(POLAR_PRODUCT_PRO_ID) && state) {
    if (hasActiveProduct(state, POLAR_PRODUCT_PRO_ID)) {
      return Response.redirect(new URL("/pricing", request.url), 302)
    }

    const [oldestFreeSubscription] = activeSubscriptionsForProduct(
      state,
      POLAR_PRODUCT_FREE_ID
    )

    subscriptionId = oldestFreeSubscription?.id
  }

  try {
    const result = await polar.checkouts.create({
      products,
      subscriptionId,
      /**
       * Polar treats this as unique and immutable once set, which is what makes
       * it usable as a join key: the second checkout from the same organization
       * resolves to the same Polar customer rather than creating a rival one.
       *
       * It is the Clerk organization id and not the user id on purpose. A team
       * is billed once, not once per member, and the person who happened to
       * click Subscribe may well leave the organization that keeps paying.
       */
      externalCustomerId: orgId,
    })

    /**
     * No `successUrl`, and no confirmation page anywhere in this application.
     * Polar hosts its own confirmation screen and shows it after payment; a
     * `successUrl` would replace that with a page of ours which knows nothing
     * about the order yet, because the authoritative signal is the webhook and
     * it does not arrive on the customer's redirect. Do not "fix" this by
     * adding one.
     */
    return Response.redirect(result.url, 302)
  } catch (error) {
    /**
     * The SDK's error carries Polar's own response — product ids, organization
     * context, sometimes the request body it rejected. That belongs in the
     * server log and nowhere near the caller, so the response is a bare 500
     * with no body.
     */
    console.error("Failed to create Polar checkout", error)

    return new Response(null, { status: 500 })
  }
}
