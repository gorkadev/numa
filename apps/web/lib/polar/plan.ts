import { auth } from "@clerk/nextjs/server"

import { polar } from "./client"
import {
  POLAR_METER_ID,
  POLAR_PRODUCT_FREE_ID,
  POLAR_PRODUCT_PRO_ID,
} from "./products"

/**
 * Which product the organization is paying for.
 *
 * `"none"` is not a plan, it is the absence of an answer, and it covers three
 * genuinely different situations on purpose: no active organization, no Polar
 * customer yet, and a Polar that could not be reached. The UI treats all three
 * the same way — it shows no plan badge and no "current plan" marker — because
 * every one of them means the same thing to a reader: this application cannot
 * currently say what you are subscribed to. Inventing `"free"` as the default
 * would be the tempting shortcut and it is the wrong one, since it would tell a
 * paying customer their plan is Free every time Polar has a bad minute.
 */
export type BillingPlan = "free" | "pro" | "none"

/**
 * What the chrome needs to know about billing, in one object.
 *
 * `balance` is `number | null`, and the `null` carries the same weight as the
 * `"unavailable"` case in `./balance.ts` — see the long note there for why a
 * balance that could not be read must never collapse into a number. It means
 * UNKNOWN, and the only correct rendering of unknown is absence: a dash, a
 * skeleton, nothing at all. What it must never render as is `0`. A confident
 * zero next to a Pro badge tells a customer who just paid twenty dollars that
 * they have nothing left, and they will believe it, because the number looks
 * exactly like a real one. A dash tells the truth, which is that we did not
 * ask successfully, and it costs the reader nothing but a refresh.
 *
 * A real `0` is still a real answer and still arrives as `0`. The distinction
 * survives all the way to the sidebar for exactly that reason.
 */
export type BillingSummary = {
  plan: BillingPlan
  balance: number | null
}

/**
 * Polar's customer-state document, named without importing it.
 *
 * The SDK publishes this type only behind a deep generated subpath, which
 * `./balance.ts` already declines to reach into for the same reason: that
 * layout is an implementation detail of the code generator, not a promise the
 * package makes. Deriving the type from the call that returns it binds this
 * file to the published surface instead, and it cannot drift — an SDK upgrade
 * that reshapes the response reshapes this alias with it, and every derivation
 * below fails to compile rather than silently reading a field that is gone.
 */
export type CustomerState = Awaited<
  ReturnType<typeof polar.customers.getStateExternal>
>

/**
 * Turns one customer-state document into the summary the chrome renders.
 *
 * # Why this is a separate, pure function
 *
 * Because the state document is expensive and the derivation is free. The
 * application shell has to provision billing on entry (see
 * `ensureBillingCustomer`), and provisioning already reads this exact document
 * to decide whether there is anything to do. Having the layout then call
 * `getBillingSummary` would ask Polar for the same document a second time, on
 * every navigation, to compute two fields out of a response it was already
 * holding. Splitting the derivation out lets the caller thread the state it
 * already has through it, so the common path — an organization that is already
 * provisioned — costs exactly one round trip instead of two.
 *
 * `null` is the caller saying it has no document: no active organization, no
 * customer, or a Polar it could not reach. All three collapse into the same
 * `"none"`/`null` summary for the reason spelled out on `BillingPlan`.
 */
export function summarizeBillingState(
  state: CustomerState | null
): BillingSummary {
  if (!state) return { plan: "none", balance: null }

  /**
   * Pro wins when both are present, and both CAN be present: the free plan is
   * granted on the organization's first visit and Polar does not revoke it when
   * a second subscription is added. Checking for the paid product first is
   * therefore the whole rule, not a tiebreak — the reverse order would label
   * every paying customer "Free".
   */
  const productIds = new Set(
    state.activeSubscriptions.map((subscription) => subscription.productId)
  )

  const plan: BillingPlan = productIds.has(POLAR_PRODUCT_PRO_ID)
    ? "pro"
    : productIds.has(POLAR_PRODUCT_FREE_ID)
      ? "free"
      : "none"

  /**
   * A customer with no matching meter really does have zero credits, the same
   * way `getCreditBalance` reads it: `activeMeters` lists what has been
   * granted, so absence is nothing granted. This is the one zero in this file
   * that is an answer rather than a failure, which is why it is `0` and not
   * `null`.
   */
  const meter = state.activeMeters.find(
    (meter) => meter.meterId === POLAR_METER_ID
  )

  return { plan, balance: meter?.balance ?? 0 }
}

/**
 * Reads the current organization's plan and credit balance in one Polar call.
 *
 * # Who still calls this
 *
 * Callers that want the summary and nothing else — the pricing page, which
 * needs to mark the current plan and has no reason to provision anything. The
 * application shell does NOT: it calls `ensureBillingCustomer` and passes the
 * state that comes back through `summarizeBillingState`, because it has to read
 * that document anyway and reading it twice per navigation is latency the user
 * pays for and quota this application spends for nothing.
 *
 * # Why one call and not two
 *
 * `getCreditBalance` already exists and already reads `getStateExternal`, so
 * the obvious implementation is to call it and then read the subscriptions
 * separately. Polar's customer state endpoint returns `activeSubscriptions` and
 * `activeMeters` side by side; asking for the same document twice to read one
 * field out of each doubles the cost of every caller.
 *
 * So this reads the state once and derives both. `getCreditBalance` is left
 * alone rather than refactored: it answers a different question for a different
 * caller (the credit gate in `trigger/chat.ts`, which needs the
 * `"unprovisioned"` and `"unavailable"` cases spelled out so it can forgive one
 * and enforce the other), and collapsing the two would force that caller to
 * accept this one's lossier shape.
 *
 * # Why `auth()` and not `auth.protect()`
 *
 * This runs inside page and layout renders that are reached by a signed-in user
 * who has no active organization — a state Clerk allows and this application
 * treats as benign everywhere else, exactly as `listGames` does.
 * `auth.protect()` would redirect that user away from a page they are entitled
 * to see. There is simply nothing to bill without an organization, so the
 * answer is the same one an unreachable Polar gives: nothing is known.
 *
 * # Why it never throws
 *
 * Nobody navigated here to look at their plan. They opened a game, and the
 * sidebar happens to show a credit count. A Polar outage must degrade that
 * count to a dash, not take the application down with it, so every failure —
 * network, auth, a missing product id, an unexpected response shape — lands in
 * the same catch and produces the same "unknown" summary.
 */
export async function getBillingSummary(): Promise<BillingSummary> {
  try {
    const { orgId } = await auth()

    if (!orgId) return summarizeBillingState(null)

    return summarizeBillingState(
      await polar.customers.getStateExternal({ externalId: orgId })
    )
  } catch {
    return summarizeBillingState(null)
  }
}
