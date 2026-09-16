/**
 * The Polar product and meter ids this application names.
 *
 * These read from the environment for the same reason `POLAR_SERVER` does in
 * `./client`, and the reason is worth stating plainly because these look far
 * more like constants than they are. A product id is not a name for a thing
 * this application knows about — it is a primary key in somebody else's
 * database, minted when a human clicked "Create product" in a Polar dashboard.
 * Sandbox and production are two separate Polar organizations, so the free
 * plan exists twice, with two unrelated ids, and neither is derivable from the
 * other.
 *
 * Hardcoding the sandbox ids would therefore ship a file that is correct in
 * development and wrong the first time it runs against real money — and wrong
 * in the most expensive direction, because the token in production
 * authenticates fine and only the id is unknown. The failure is a rejected
 * subscription for a paying customer, discovered by that customer.
 *
 * There are deliberately no fallbacks. A default id would have to be one
 * environment's id, which means it silently "works" in exactly one place and
 * quietly grants or denies the wrong product everywhere else — an unset
 * variable that fails loudly on the first call is strictly better than a set
 * one that is subtly wrong forever.
 *
 * The `as string` casts are the same trade `./client` makes for the access
 * token: nothing is validated at import time, so a missing variable surfaces as
 * Polar's own error naming the request and the field it rejected, which says
 * more than any throw written here could. What must never happen is somebody
 * "fixing" the cast by adding a `??` with a literal id after it.
 */

/** The free plan every organization is subscribed to on provisioning. */
export const POLAR_PRODUCT_FREE_ID = process.env.POLAR_PRODUCT_FREE_ID as string

/** The lower paid monthly plan: $20/month for 2000 credits. */
export const POLAR_PRODUCT_PRO_ID = process.env.POLAR_PRODUCT_PRO_ID as string

/**
 * The higher paid monthly plan: $50/month for 5500 credits — a 10% bonus over
 * Pro's credits-per-dollar, priced to reward the bigger monthly commitment
 * rather than to change what a credit is worth. See `lib/polar/plan.ts` for
 * why Max must be checked before Pro when deriving a `BillingPlan`.
 */
export const POLAR_PRODUCT_MAX_ID = process.env.POLAR_PRODUCT_MAX_ID as string

/**
 * The two paid monthly plans, in the order a customer would upgrade through
 * them. `app/checkout/route.ts` and `app/(app)/pricing/actions.ts` both need
 * "is this a paid plan" as a single check rather than two separate ones that
 * could silently fall out of sync the next time a plan is added.
 */
export const POLAR_PAID_PRODUCT_IDS = [
  POLAR_PRODUCT_PRO_ID,
  POLAR_PRODUCT_MAX_ID,
] as const

/**
 * The one-off credit packs. Only meaningful on top of an active subscription —
 * see the guard in `app/checkout/route.ts` for why that is enforced and not
 * merely assumed.
 *
 * All three price at 100 credits per dollar with no bonus, unlike the
 * subscriptions: a top-up is a release valve for a heavy month, not a product
 * with its own pricing curve, so `$10 → 1000`, `$25 → 2500` and `$50 → 5000`
 * are the same rate at three sizes rather than three different deals.
 */
export const POLAR_PRODUCT_TOPUP_ID = process.env
  .POLAR_PRODUCT_TOPUP_ID as string

/** $25 → 2500 credits. */
export const POLAR_PRODUCT_TOPUP_2500_ID = process.env
  .POLAR_PRODUCT_TOPUP_2500_ID as string

/** $50 → 5000 credits. */
export const POLAR_PRODUCT_TOPUP_5000_ID = process.env
  .POLAR_PRODUCT_TOPUP_5000_ID as string

/**
 * All three top-up packs. `app/checkout/route.ts` needs to recognize any of
 * them as "a top-up" for the same paid-plan guard, regardless of size.
 */
export const POLAR_TOPUP_PRODUCT_IDS = [
  POLAR_PRODUCT_TOPUP_ID,
  POLAR_PRODUCT_TOPUP_2500_ID,
  POLAR_PRODUCT_TOPUP_5000_ID,
] as const

/**
 * The `Game credits` meter — the one whose balance decides whether a turn may
 * run.
 *
 * This is the read side of the join `lib/polar/events.ts` writes into. That
 * module's `GAME_TURN_EVENT_NAME` and `CREDITS_METADATA_PROPERTY` are what the
 * meter's filter and aggregation select on; this id is how a reader picks that
 * meter out of `activeMeters` afterwards. All three have to name the same meter
 * in the same Polar organization, and nothing checks that they do.
 */
export const POLAR_METER_ID = process.env.POLAR_METER_ID as string
