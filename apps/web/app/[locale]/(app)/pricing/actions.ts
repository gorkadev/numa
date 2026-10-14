"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { requireSession } from "@/lib/session"
import { polar } from "@/lib/polar/client"
import { ingestPlanUpgradeAdjustment } from "@/lib/polar/events"
import { activePaidSubscription, readCustomerState } from "@/lib/polar/plan"
import {
  computePlanChangeMath,
  readPlanChangeInputs,
} from "@/lib/polar/plan-change"
import {
  POLAR_PRODUCT_MAX_ID,
  POLAR_PRODUCT_PRO_ID,
} from "@/lib/polar/products"

/**
 * How many times a failed clawback ingestion is retried before this
 * application gives up and logs the amount for a human to apply by hand.
 *
 * Three attempts, not one and not ten. One attempt treats a single dropped
 * request the same as a genuine Polar outage, and this correction runs after
 * the customer has already been charged — worth a couple of retries before
 * accepting the loss. Ten attempts would hold the Server Action open chasing
 * a failure that is, by the third try, almost certainly not transient; past
 * that point the honest move is to log it and let a human look, not to keep
 * the customer's browser waiting on a request that already told them their
 * plan changed.
 */
const CLAWBACK_INGEST_ATTEMPTS = 3

/**
 * The pause between clawback ingestion retries, in milliseconds.
 *
 * Fixed rather than exponential: this is not a rate limit being respected,
 * it is a best-effort second and third chance at a call that already failed
 * once. The whole retry loop has to stay short enough that it does not turn
 * a redirect the customer is waiting on into a visible stall, so the backoff
 * is a token gap rather than a real one.
 */
const CLAWBACK_INGEST_BACKOFF_MS = 250

/**
 * Retries `ingestPlanUpgradeAdjustment` a few times, then gives up loudly.
 *
 * # Why this never throws and never blocks success
 *
 * By the time this runs, `polar.subscriptions.update` has already succeeded
 * and the customer has already been charged the prorated difference — see
 * `changePlanAction`'s own note on why that call happens before this one. A
 * clawback that cannot be recorded is a bookkeeping problem this application
 * has with itself, not a reason to tell a customer who just paid that their
 * upgrade failed. So every attempt failing still leaves the upgrade a
 * success; the only trace is the `console.error` below, with enough in it —
 * the user, the subscription and the exact amount — for someone to apply the
 * correction by hand.
 */
async function ingestClawbackWithRetries({
  userId,
  subscriptionId,
  periodStart,
  credits,
}: {
  userId: string
  subscriptionId: string
  periodStart: Date
  credits: number
}): Promise<void> {
  for (let attempt = 1; attempt <= CLAWBACK_INGEST_ATTEMPTS; attempt++) {
    const ingested = await ingestPlanUpgradeAdjustment({
      userId,
      subscriptionId,
      periodStart,
      credits,
    })

    if (ingested) return

    if (attempt < CLAWBACK_INGEST_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, CLAWBACK_INGEST_BACKOFF_MS * attempt)
      )
    }
  }

  console.error(
    `changePlanAction: failed to ingest the plan-upgrade clawback after ${CLAWBACK_INGEST_ATTEMPTS} attempts — apply it by hand`,
    { userId, subscriptionId, credits }
  )
}

/**
 * Moves a user directly between the two paid plans, Pro and Max, by
 * updating its existing Polar subscription rather than buying a new one.
 *
 * # Why this is an update and not a checkout
 *
 * `app/checkout/route.ts` mints a checkout session, and a checkout session is
 * always a NEW subscription — that is what makes it wrong for a plan change.
 * A user moving from Pro to Max already has a subscription generating
 * revenue; a checkout for Max would create a second one next to it rather
 * than converting the first, leaving the user double-billed until somebody
 * notices. `polar.subscriptions.update` is the call built for exactly this:
 * it mutates the existing subscription's product in place, and Polar prorates
 * or defers the difference according to `prorationBehavior` rather than
 * treating this as two unrelated purchases.
 *
 * # Why this is a Server Action invoked from a `<form>`, and never a link
 *
 * A GET request — a link, a prefetch, a browser back/forward navigation — can
 * be triggered by something other than an intentional click: `<Link>`
 * prefetching, a crawler, a browser restoring tabs. None of that is a
 * problem for `app/checkout/route.ts`'s `GET`, because the worst a stray
 * request there can do is open a Polar-hosted checkout page that nobody pays.
 * It is a real problem here, because a stray call to THIS function charges or
 * reschedules a real subscription with no human in the loop. A Server Action
 * bound to a `<form action={...}>` is a POST under the hood — see the forms
 * guide in `node_modules/next/dist/docs/01-app/02-guides/forms.md` — and Next
 * never prefetches or speculatively invokes it, so it only ever runs when a
 * human submits the form on the pricing page.
 *
 * # Why the target is validated here even though only two forms ever call it
 *
 * `changePlanAction.bind(null, targetProductId)` is bound server-side in
 * `app/(app)/pricing/page.tsx` from `POLAR_PRODUCT_PRO_ID` or
 * `POLAR_PRODUCT_MAX_ID`, so an honest form submission can only ever send one
 * of the two. But a Server Action is reachable as its own POST endpoint once
 * a client has its action reference, and the bound argument travels with that
 * reference as an ordinary serialized value rather than something this
 * function is entitled to trust. Refusing anything that is not exactly one of
 * the two paid product ids is what keeps that boundary real rather than
 * assumed.
 *
 * # Why failure surfaces as a redirect with a query flag, not a thrown error
 *
 * This function is invoked directly by a `<form>`'s `action`, with no
 * `useActionState` on the other end to catch a returned error shape — adding
 * one would mean turning the pricing page into a Client Component for a
 * failure path that, by volume, is rare. A thrown error would instead surface
 * as Next's generic error boundary, which knows nothing about billing and
 * would tell a customer whose card was just declined that "something went
 * wrong" with no way back to the page they were just on. Redirecting to
 * `/pricing?planChangeError=1` keeps the failure on the page that already
 * explains the plans, lets that page render one honest line, and costs
 * nothing on the far more common success path, which redirects to the same
 * place without the flag.
 *
 * # Why Polar's error never reaches the customer verbatim
 *
 * Same rule as `app/checkout/route.ts`'s checkout failure: the SDK's error
 * carries Polar's own response, which belongs in the server log and nowhere
 * near the caller. A declined card, an expired payment method, or a Polar
 * outage all collapse into the same short message here — there is nothing
 * actionable in the distinction for someone who cannot see the log anyway,
 * and the retry is the same for all three: try again or update payment
 * details in Polar's own customer portal.
 */
export async function changePlanAction(targetProductId: string): Promise<void> {
  const { user } = await requireSession()

  if (
    targetProductId !== POLAR_PRODUCT_PRO_ID &&
    targetProductId !== POLAR_PRODUCT_MAX_ID
  ) {
    console.error(
      `changePlanAction: refusing to change plan to unknown product "${targetProductId}"`
    )
    redirect("/pricing?planChangeError=1")
  }

  const state = await readCustomerState(user.id)
  const subscription = state ? activePaidSubscription(state) : undefined

  /**
   * No active Pro or Max subscription to change. A Free user reaches this
   * page's checkout links, never these forms — see the CTA logic in
   * `app/(app)/pricing/page.tsx` — so a user landing here with nothing to
   * change means either a stale page still open in another tab after a
   * cancellation, or the same tampering `targetProductId` is checked against
   * above. Either way there is nothing to update.
   */
  if (!subscription) {
    console.error(
      `changePlanAction: user ${user.id} has no active paid subscription to change`
    )
    redirect("/pricing?planChangeError=1")
  }

  /**
   * Already on the requested plan. Reachable if the same tab is behind the
   * user's real state — a downgrade that already took effect at the period
   * boundary, for instance — rather than a bug in which plan a given form
   * targets, since each form only ever binds the OTHER paid plan's id.
   */
  if (subscription.productId === targetProductId) {
    redirect("/pricing")
  }

  /**
   * `prorationBehavior` is the whole business decision from here down.
   * `"invoice"` charges the difference immediately, which is right for an
   * upgrade to Max: the customer asked for more credits now, and Polar
   * returning an error on a failed charge leaves the subscription exactly as
   * it was — nothing to unwind. `"next_period"` defers the change to the next
   * billing cycle, which is right for a downgrade to Pro: nothing should be
   * refunded mid-cycle for credits already granted, and the user keeps their
   * Max allowance until the period it already paid for ends.
   */
  const prorationBehavior =
    targetProductId === POLAR_PRODUCT_MAX_ID ? "invoice" : "next_period"

  /**
   * The Pro→Max clawback, computed BEFORE Polar is touched.
   *
   * # The exploit this closes
   *
   * `subscriptions.update` with `prorationBehavior: "invoice"` charges the
   * prorated price difference correctly, but a sandbox run showed Polar
   * revokes the Pro `meter_credit` benefit and grants the Max one IN FULL —
   * the full +3500 credits, regardless of how much of the billing cycle
   * remains. Upgrading on the last day of a cycle charges about a dollar for
   * a full month's worth of extra credits, and nothing in Polar's own
   * billing catches it, because the benefit swap has no proration logic of
   * its own. See `lib/polar/events.ts`'s `ingestPlanUpgradeAdjustment` for
   * how the unearned share gets taken back, and `lib/polar/plan-change.ts`
   * for the math shared with this page's upgrade preview so the two can
   * never promise different numbers.
   *
   * # Why this read happens before `subscriptions.update`, not after
   *
   * `extraUnits` — how many more credits Max grants than Pro — has to come
   * from Polar's own benefit configuration, never a hardcoded `3500`, or a
   * future price or benefit change silently desyncs the clawback from what
   * Polar actually grants. If that read fails, refusing the plan change
   * here costs nothing to unwind: no charge has happened yet, `subscription`
   * is untouched, and the customer sees the same error redirect a declined
   * card would produce. Running the same read AFTER the update would instead
   * mean occasionally charging a customer and changing their plan with no
   * way to compute how many of the extra credits to claw back — a state with
   * no safe corrective action left.
   *
   * `subscription.currentPeriodStart` / `currentPeriodEnd` are read from the
   * Pro subscription fetched above, before Polar has touched it — exactly
   * the period the customer is part-way through and part-way paid for.
   * Reading them from a POST-update subscription would read Max's fresh
   * period instead, which starts NOW and would compute a fraction remaining
   * of ~1 — clawing back almost nothing.
   */
  let clawbackUnits = 0

  if (targetProductId === POLAR_PRODUCT_MAX_ID) {
    const inputs = await readPlanChangeInputs()

    if (!inputs) {
      console.error(
        `changePlanAction: could not read Polar product benefits for user ${user.id}; refusing the upgrade`
      )
      redirect("/pricing?planChangeError=1")
    }

    clawbackUnits = computePlanChangeMath({
      now: new Date(),
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      ...inputs,
    }).clawbackUnits
  }

  try {
    await polar.subscriptions.update({
      id: subscription.id,
      subscriptionUpdate: {
        productId: targetProductId,
        prorationBehavior,
      },
    })
  } catch (error) {
    console.error("Failed to change Polar subscription plan", error)
    redirect("/pricing?planChangeError=1")
  }

  /**
   * The customer has now been charged and the subscription has already
   * moved to Max — Polar's grant already landed or is about to (the sandbox
   * observed it about 3 seconds after `subscriptions.update` returns). A
   * clawback below zero would only ever fire on a downgrade, which never
   * reaches this branch, so `clawbackUnits <= 0` here means either a
   * downgrade or an upgrade so close to the period's end that nothing is
   * owed back — neither is worth an ingestion call the meter would carry
   * forever for saying nothing.
   */
  if (clawbackUnits > 0) {
    await ingestClawbackWithRetries({
      userId: user.id,
      subscriptionId: subscription.id,
      periodStart: subscription.currentPeriodStart,
      credits: clawbackUnits,
    })
  }

  /**
   * The sidebar's plan badge and credit balance are rendered by the (app)
   * layout, and the pricing page's own "Current plan" markers read the same
   * `BillingSummary` — neither re-renders from a plain `redirect` to a URL
   * that shares this layout, the same reason `refresh` is called before
   * `redirect` in `lib/games/actions.ts`. It runs before the redirect so the
   * destination renders against fresh data, and — per the "Redirect after a
   * mutation" guidance in `node_modules/next/dist/docs/01-app/01-getting-
   * started/07-mutating-data.md` — a `redirect` thrown afterward would never
   * let code after it run.
   */
  refresh()

  redirect("/pricing?planChanged=1")
}
