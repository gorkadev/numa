import { requireSession } from "@/lib/session"
import { polar } from "@/lib/polar/client"
import { ensureBillingCustomer } from "@/lib/polar/customers"
import {
  activeSubscriptionsForProduct,
  hasActivePaidPlan,
  readCustomerState,
} from "@/lib/polar/plan"
import {
  POLAR_PAID_PRODUCT_IDS,
  POLAR_PRODUCT_FREE_ID,
  POLAR_TOPUP_PRODUCT_IDS,
} from "@/lib/polar/products"

/**
 * Opens a Polar checkout for the products named in the query string and sends
 * the browser to it.
 *
 * The buyer is never taken from the request. The signed-in user's id is
 * derived from the session and passed to Polar as `externalCustomerId`,
 * exactly as `lib/games/queries.ts` derives the `user_id` predicate it
 * filters games by — the tenant boundary is a property of who is asking, and
 * a caller that could name the user it is paying for could name somebody
 * else's.
 *
 * That field is the whole point of this route being authenticated. It is the
 * only thing that maps a Polar customer back to a tenant in this application:
 * Polar knows about orders and customers, this database knows about users,
 * and `externalCustomerId` is the single value that joins them. Without it
 * the money arrives, `order.paid` fires, and the webhook cannot answer the
 * only question that matters — which user just paid — so the payment can be
 * neither credited nor reconciled, and the customer has been charged for
 * something this application cannot give them.
 */
export async function GET(request: Request): Promise<Response> {
  /**
   * `requireSession()` rather than `getSession()`: an anonymous browser
   * landing here should be sent to sign in and come back, which is what
   * `requireSession()`'s redirect does, not shown a JSON error it cannot act
   * on. Unlike the Clerk version this replaces, there is no further "signed
   * in but nothing to buy for" state to check afterwards — this application
   * has no organization concept, so a session always names exactly one payer.
   */
  const { user } = await requireSession()

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
   * worse: a completed Polar checkout with no `externalCustomerId` creates an
   * ad hoc customer of its own for whoever paid, which bypasses
   * `ensureBillingCustomer` entirely and gives the USER nothing — no
   * `externalId` pointing at their account, none of the provisioning the rest
   * of this integration depends on. Routing "Get started" through
   * `ensureBillingCustomer` instead is what actually grants the user their
   * plan, the same call the application shell already makes on every render.
   */
  if (products.includes(POLAR_PRODUCT_FREE_ID)) {
    await ensureBillingCustomer()

    return Response.redirect(new URL("/", request.url), 302)
  }

  const state = await readCustomerState(user.id)

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
   *
   * Any of the three top-up packs counts — `$10`, `$25` and `$50` are the same
   * product for this rule's purposes, three sizes of the same release valve —
   * and either paid plan satisfies it. A Max subscriber is exactly as entitled
   * to a top-up as a Pro one; nothing about the guard's reasoning above cares
   * which paid plan is active, only that one is.
   */
  if (
    POLAR_TOPUP_PRODUCT_IDS.some((productId) => products.includes(productId))
  ) {
    if (!state || !hasActivePaidPlan(state)) {
      return Response.json(
        { error: "A paid plan is required to buy extra credits" },
        { status: 409 }
      )
    }
  }

  /**
   * Free-to-paid upgrade in Polar, not a second subscription next to the
   * first — for either paid plan.
   *
   * A checkout that names a paid product for a user that already has an
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
   * A user that already holds an active PAID subscription — Pro or Max, and
   * whether or not it is the one named in the request — is sent back to the
   * pricing page rather than into a doomed or redundant checkout. A same-plan
   * request has nothing left to buy, and Polar's own rejection would be a
   * worse way to say so. A request for the OTHER paid plan is a plan CHANGE,
   * not a purchase, and it belongs to `app/(app)/pricing/actions.ts`'s
   * `changePlanAction`, which calls `polar.subscriptions.update` so the
   * existing subscription is prorated and converted rather than a second one
   * created alongside it — this route only ever mints NEW checkouts.
   */
  let subscriptionId: string | undefined

  if (
    POLAR_PAID_PRODUCT_IDS.some((productId) => products.includes(productId)) &&
    state
  ) {
    if (hasActivePaidPlan(state)) {
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
       * it usable as a join key: the second checkout from the same user
       * resolves to the same Polar customer rather than creating a rival one.
       */
      externalCustomerId: user.id,
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
     * The SDK's error carries Polar's own response — product ids, customer
     * context, sometimes the request body it rejected. That belongs in the
     * server log and nowhere near the caller, so the response is a bare 500
     * with no body.
     */
    console.error("Failed to create Polar checkout", error)

    return new Response(null, { status: 500 })
  }
}
