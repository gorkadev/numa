import { getSession } from "@/lib/session"

import { polar } from "./client"
import { activePaidSubscription, readCustomerState } from "./plan"
import { POLAR_PRODUCT_MAX_ID, POLAR_PRODUCT_PRO_ID } from "./products"

/**
 * What a Pro→Max upgrade costs and grants, expressed as numbers a UI can
 * render and an action can act on.
 *
 * # Why this exists as its own pure function
 *
 * `app/(app)/pricing/actions.ts`'s `changePlanAction` and
 * `app/(app)/pricing/page.tsx`'s upgrade preview both need this exact
 * arithmetic — the action to decide how many credits to claw back after
 * Polar over-grants them, the page to tell the customer what to expect before
 * they click. If each computed it independently, the day one of them rounds
 * differently or reads a stale constant, the preview would promise a number
 * the clawback does not honor — a promise a customer can screenshot. Routing
 * both through one function makes that disagreement impossible rather than
 * merely unlikely: there is exactly one place this math can be wrong, and
 * fixing it fixes both callers at once.
 *
 * It takes plain numbers and `Date`s rather than a Polar subscription or
 * product, on purpose. Nothing in here needs to know how a `Date` got read
 * from a `CustomerStateSubscription` or a price got read from a `Product` —
 * that is `readPlanChangeInputs`'s job, immediately below. Keeping this half
 * ignorant of Polar's shapes is what makes it cheap to unit-test with plain
 * numbers instead of a mocked SDK client.
 */
export type PlanChangeMath = {
  /**
   * How much of the CURRENT billing period is still ahead of the customer at
   * the moment of the upgrade, clamped to `[0, 1]`. `1` means the upgrade
   * happens the instant the period started; `0` means it happens at (or
   * after) the period's end. The clamp matters because `now` is read
   * separately from the period boundaries it is compared against — a clock
   * skew or a stale read could otherwise put `now` outside
   * `[currentPeriodStart, currentPeriodEnd]` and produce a fraction outside
   * `[0, 1]`, which would then corrupt every number derived from it below.
   */
  fractionRemaining: number
  /**
   * How many more `meter_credit` units Max grants than Pro, per Polar's own
   * benefit configuration — never hardcoded, because Polar's benefit
   * `properties.units` is what actually grants credits on an upgrade. A
   * constant in this repository could drift from that value silently; a read
   * of the same field Polar itself grants from cannot.
   */
  extraUnits: number
  /**
   * How many of `extraUnits` this upgrade takes back, because the customer
   * has not yet paid for that share of the current period. Floored rather
   * than rounded or ceilinged — see `computePlanChangeMath` for why rounding
   * in the customer's favor is the only direction that cannot turn a
   * clawback into an overcharge.
   */
  clawbackUnits: number
  /**
   * `extraUnits - clawbackUnits`: the extra credits the customer actually
   * keeps. This is the number the upgrade preview promises, and the number
   * the clawback event is sized to make true — Polar grants `extraUnits` in
   * full and this application takes back `clawbackUnits`, so the two halves
   * always sum back to `extraUnits` by construction.
   */
  netExtraUnits: number
  /**
   * An ESTIMATE of what Polar will charge today, in cents, for display only.
   * Polar computes the real invoice from its own proration logic at the
   * moment `subscriptions.update` runs; this is `(maxPriceCents -
   * proPriceCents) * fractionRemaining`, the same shape of calculation, read
   * far enough in advance to show before the customer commits. The two can
   * disagree by a few cents from Polar's own rounding, which is why the
   * preview copy in `page.tsx` says "about $X" rather than promising a
   * number to the cent.
   */
  estimatedChargeCents: number
}

/**
 * The pure arithmetic behind a Pro→Max upgrade's clawback and preview.
 *
 * # Why `Math.floor` for the clawback, specifically
 *
 * Rounding a clawback UP would occasionally take back a credit the customer
 * had genuinely paid for — indistinguishable, from where the customer sits,
 * from simply losing credits they were promised. Rounding it DOWN instead
 * means the worst case is this application under-collects a fractional
 * credit, which costs nothing anyone will ever notice. The two directions are
 * not symmetric in who eats the rounding error, so only one of them is safe
 * to pick by default.
 *
 * # Why `totalPeriodMs <= 0` collapses to `fractionRemaining: 0`
 *
 * A billing period's end can never be before its start in a healthy Polar
 * response, but this function does not get to assume the response it was
 * handed is healthy — it takes whatever `readPlanChangeInputs` read off the
 * subscription. Dividing by a zero or negative span would produce `Infinity`
 * or `NaN`, either of which would then propagate through `clawbackUnits` and
 * `estimatedChargeCents` as garbage. Treating that case as "no time
 * remaining" claws back the FULL extra grant instead — the same answer this
 * function gives for an upgrade made after the period has already ended, and
 * the conservative side to fail toward: it costs the customer nothing they
 * were not going to get on the next period anyway, whereas granting the full
 * extra amount on bad data would repeat the exact exploit this function
 * exists to close.
 */
export function computePlanChangeMath({
  now,
  currentPeriodStart,
  currentPeriodEnd,
  proUnits,
  maxUnits,
  proPriceCents,
  maxPriceCents,
}: {
  now: Date
  currentPeriodStart: Date
  currentPeriodEnd: Date
  proUnits: number
  maxUnits: number
  proPriceCents: number
  maxPriceCents: number
}): PlanChangeMath {
  const totalPeriodMs = currentPeriodEnd.getTime() - currentPeriodStart.getTime()
  const remainingMs = currentPeriodEnd.getTime() - now.getTime()

  const fractionRemaining =
    totalPeriodMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalPeriodMs)) : 0

  const extraUnits = maxUnits - proUnits
  const clawbackUnits = Math.max(
    0,
    Math.floor(extraUnits * (1 - fractionRemaining))
  )
  const netExtraUnits = extraUnits - clawbackUnits
  const estimatedChargeCents = Math.round(
    (maxPriceCents - proPriceCents) * fractionRemaining
  )

  return {
    fractionRemaining,
    extraUnits,
    clawbackUnits,
    netExtraUnits,
    estimatedChargeCents,
  }
}

/**
 * The Polar reads `computePlanChangeMath` needs and never hardcodes: each
 * paid product's `meter_credit` benefit units and its fixed monthly price.
 *
 * Both products are read with one `Promise.all`, not sequentially — this
 * runs on the critical path of `changePlanAction`'s upgrade, between the
 * customer clicking and Polar being charged, and a sequential pair of round
 * trips would be waiting twice for no reason.
 *
 * Returns `null` on ANY failure — a missing benefit, a missing fixed price, a
 * network error, an unexpected product shape — rather than throwing. The two
 * callers need that uniformly: `changePlanAction` refuses the upgrade before
 * anything is charged (see its own note on why that read happens before
 * `subscriptions.update` rather than after), and the pricing page's preview
 * simply omits itself. Neither caller wants to distinguish failure reasons,
 * so collapsing them here is what lets both stay short.
 *
 * Exported so `changePlanAction` can call it directly: the action already
 * holds the active Pro subscription it read before calling
 * `subscriptions.update` — see that function's own note on why the period
 * must be read BEFORE the update — so it has no use for `getUpgradePreview`'s
 * own subscription lookup below, only for these product reads and the shared
 * math underneath them.
 */
export async function readPlanChangeInputs(): Promise<{
  proUnits: number
  maxUnits: number
  proPriceCents: number
  maxPriceCents: number
} | null> {
  try {
    const [proProduct, maxProduct] = await Promise.all([
      polar.products.get({ id: POLAR_PRODUCT_PRO_ID }),
      polar.products.get({ id: POLAR_PRODUCT_MAX_ID }),
    ])

    const proUnits = meterCreditUnits(proProduct)
    const maxUnits = meterCreditUnits(maxProduct)
    const proPriceCents = fixedPriceCents(proProduct)
    const maxPriceCents = fixedPriceCents(maxProduct)

    if (
      proUnits === null ||
      maxUnits === null ||
      proPriceCents === null ||
      maxPriceCents === null
    ) {
      console.error(
        "Pro or Max product is missing a meter_credit benefit or a fixed price"
      )

      return null
    }

    return { proUnits, maxUnits, proPriceCents, maxPriceCents }
  } catch (error) {
    console.error("Failed to read Polar product benefits for a plan change", error)

    return null
  }
}

/**
 * The `meter_credit` benefit's granted units on a product, or `null` if the
 * product carries no such benefit.
 *
 * Reading Polar's own benefit configuration — rather than the `2000` and
 * `5500` this application's marketing copy quotes — is the whole point: the
 * benefit is what actually credits the customer's meter on a plan change, so
 * it is the only number that cannot silently drift from what Polar does.
 */
function meterCreditUnits(product: {
  benefits: Array<{ type: string; properties?: unknown }>
}): number | null {
  const benefit = product.benefits.find(
    (candidate): candidate is { type: "meter_credit"; properties: { units: number } } =>
      candidate.type === "meter_credit"
  )

  return benefit?.properties.units ?? null
}

/**
 * A product's fixed monthly price, in cents, or `null` if it has none.
 *
 * Polar's `prices` array is typed as a union because a product can be priced
 * several different ways — fixed, custom "pay what you want", metered, seat-
 * based — and Pro and Max are both plain fixed-price subscriptions. Filtering
 * on `amountType === "fixed"` is how the SDK's own generated types
 * discriminate that union; anything else on either product would be a
 * pricing model this application's proration math was never built for.
 */
function fixedPriceCents(product: {
  prices: Array<{ amountType: string; priceAmount?: number }>
}): number | null {
  const price = product.prices.find((candidate) => candidate.amountType === "fixed")

  return price?.priceAmount ?? null
}

/**
 * `PlanChangeMath` plus the one Polar-sourced field the pricing page needs to
 * word the preview but that has nothing to do with the arithmetic itself:
 * when the CURRENT period — the one the customer is part-way through right
 * now — ends.
 *
 * `prorationBehavior: "invoice"` charges the price difference immediately
 * without moving the subscription's billing anchor, so the date the
 * customer's card is next charged does not change just because they
 * upgraded mid-cycle. Kept as its own type rather than folded into
 * `PlanChangeMath` so that type stays what its name says — pure arithmetic a
 * unit test can call with plain numbers — instead of also being a Polar
 * `Date` passthrough.
 */
export type PlanChangePreview = PlanChangeMath & {
  currentPeriodEnd: Date
}

/**
 * The upgrade preview `app/(app)/pricing/page.tsx` renders next to the
 * "Upgrade to Max" form for a user currently on Pro.
 *
 * Scoped to Pro users by construction, not by a check the caller has to
 * remember to add: it reads the user's active PAID subscription and bails
 * out unless that subscription's product is specifically Pro. This is also
 * why the Polar product reads inside `readPlanChangeInputs` only ever happen
 * for a Pro-plan viewer — a Free, Max or unprovisioned user returns before
 * either product is fetched, so nobody pays that round trip to render a
 * preview that would not apply to them.
 *
 * Returns `null` on any failure — no session, no Polar customer, no
 * active Pro subscription, or a product read that failed — and the page
 * treats `null` as "render nothing", per the task's own instruction that a
 * failed preview must never break the page. This mirrors
 * `getBillingSummary`'s "never throws" contract in `./plan.ts` for the same
 * reason: nobody opened the pricing page to watch a Polar hiccup take it
 * down.
 */
export async function getUpgradePreview(): Promise<PlanChangePreview | null> {
  try {
    const session = await getSession()

    if (!session) return null

    const state = await readCustomerState(session.user.id)

    if (!state) return null

    const subscription = activePaidSubscription(state)

    if (!subscription || subscription.productId !== POLAR_PRODUCT_PRO_ID) {
      return null
    }

    const inputs = await readPlanChangeInputs()

    if (!inputs) return null

    return {
      ...computePlanChangeMath({
        now: new Date(),
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        ...inputs,
      }),
      currentPeriodEnd: subscription.currentPeriodEnd,
    }
  } catch (error) {
    console.error("Failed to compute the Pro→Max upgrade preview", error)

    return null
  }
}
