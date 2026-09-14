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

/** The paid monthly plan. */
export const POLAR_PRODUCT_PRO_ID = process.env.POLAR_PRODUCT_PRO_ID as string

/**
 * The one-off credit pack. Only meaningful on top of an active subscription —
 * see the guard in `app/checkout/route.ts` for why that is enforced and not
 * merely assumed.
 */
export const POLAR_PRODUCT_TOPUP_ID = process.env
  .POLAR_PRODUCT_TOPUP_ID as string

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
