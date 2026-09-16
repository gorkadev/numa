import { getSession } from "@/lib/session"

import { polar } from "./client"
import { activeSubscriptionsForProduct } from "./plan"
import type { CustomerState } from "./plan"
import { POLAR_PRODUCT_FREE_ID } from "./products"

/**
 * What Polar currently knows about this user.
 *
 * Three answers, not two, and the third is the one that matters. "The customer
 * exists" is not the same question as "the user has their free plan", and an
 * earlier version of this file asked the first while meaning the second. That
 * bug is worth naming because it was silent and permanent: if the customer
 * create succeeded and the subscription create then failed, every later call
 * saw a customer, returned early, and the free plan was never granted. The
 * user sat there forever with a customer, no entitlement and a balance of
 * zero, and the only symptom was being refused credits nobody had ever
 * given them.
 *
 * `"unreachable"` answers any failure that is not a 404, and it deliberately
 * stops the caller rather than letting it guess. Reading "does not exist" out
 * of a network blip would attempt a create against a customer that may already
 * be there; reading "exists" out of it would skip a provisioning that may be
 * genuinely missing. Neither guess is safe, so the caller does nothing and the
 * next game creation asks again.
 */
type BillingState =
  | { status: "missing" }
  | { status: "provisioned"; subscribed: boolean; state: CustomerState }
  | { status: "unreachable" }

async function readBillingState(userId: string): Promise<BillingState> {
  try {
    const state = await polar.customers.getStateExternal({
      externalId: userId,
    })

    /**
     * The whole document is carried on the result, not just the answer derived
     * from it. `getStateExternal` returns the plan and the credit meter in the
     * same body, so the caller that provisioned billing is already holding
     * everything the sidebar needs — see `ensureBillingCustomer`, which hands
     * this straight to `summarizeBillingState` rather than asking Polar again.
     */
    return {
      status: "provisioned",
      subscribed: state.activeSubscriptions.length > 0,
      state,
    }
  } catch (error) {
    /**
     * A 404 is the answer, not the failure: a customer that was never created
     * is exactly what "not provisioned" means, and Polar has no other way to
     * say it.
     */
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 404
    ) {
      return { status: "missing" }
    }

    return { status: "unreachable" }
  }
}

/**
 * The signed-in user's display name and contact email, from the session
 * already read by `ensureBillingCustomer`. Both fields are guaranteed present
 * on a Better Auth `user` — `email` is required by the core schema and `name`
 * defaults to the provider profile's display name — so, unlike the Clerk
 * version this replaces, there is no separate call and no failure case: a
 * caller that has a session already has both.
 */
function customerIdentity(user: { name: string; email: string }): {
  name: string
  email: string
} {
  return { name: user.name || user.email, email: user.email }
}

/**
 * Gives this user a Polar customer and a free-plan subscription, once, and
 * answers with the customer state it ended up with.
 *
 * # Why the customer is an individual with the user's own contact details
 *
 * There is no organization concept in this application: the individual user
 * is the tenant everywhere else in this schema — `games.userId` is what
 * `lib/games/queries.ts` filters on, the checkout in `app/checkout/route.ts`
 * pays as a user, and the meter events in `lib/polar/events.ts` are
 * attributed to a user. So the Polar customer is a plain `type: "individual"`
 * customer seeded with that same user's own name and email, rather than the
 * `team` customer with a separate `owner` this file used to create for a
 * Clerk organization.
 *
 * `externalId` is the identity — the Better Auth user id — and it is
 * immutable in Polar once set. `email` and `name` are contact details, not
 * identity: nothing downstream ever looks the customer up by either, so a
 * later profile-name or email change on the user simply stops matching what
 * Polar shows for display purposes, without touching the subscription, the
 * meter, or the balance underneath it.
 *
 * # Why this runs on entry to the app, and not from a hook
 *
 * The obvious place to provision is a Better Auth `user.create.after`
 * database hook (see the core Database docs), and it is the wrong one for
 * three separate reasons, any one of which is fatal on its own.
 *
 * A hook has exactly ONE chance. If Polar is down for the second it takes to
 * handle, nothing anywhere notices: the user exists forever with no customer,
 * and the first symptom is being refused a turn for credits nobody ever
 * granted them. There is no second attempt because there is no second
 * `create.after`.
 *
 * A hook cannot help a user who already EXISTS. Every account created before
 * the hook was written — which, when this moved here, was all of them,
 * including the repository owner's — is permanently outside its reach.
 * Backfilling them means a one-off script, and a one-off script is a thing
 * somebody has to remember to run again the next time provisioning changes.
 *
 * And running Polar calls inside an auth hook couples sign-in latency, and
 * sign-in reliability, to a third party's uptime — a Polar outage would start
 * failing sign-ins rather than merely leaving a plan badge blank.
 *
 * Provisioning on entry to the application shell has none of those problems.
 * It is self-healing: every navigation is another chance, so a failure costs
 * a page load rather than an account. It covers accounts of every vintage,
 * because it asks about the user in front of it rather than about an event
 * that may have happened years ago. And it needs no infrastructure at all.
 *
 * # Why a write during a layout render is acceptable HERE
 *
 * The general rule against mutating from a render is a good one and this is a
 * real exception to it, not an oversight. The write is idempotent, so a render
 * that happens twice — React, a retry, two tabs — converges on the same state
 * rather than compounding. It is SKIPPED entirely on the overwhelmingly common
 * path: a user who already has their plan costs one state read and returns,
 * and after the first visit that is every visit forever. And the alternative
 * is not "a cleaner render", it is a user who cannot use the product at all —
 * no subscription, no credits, and a chat that refuses every turn with no
 * action available in the UI to fix it.
 *
 * # Why the state is returned rather than re-read
 *
 * Because the caller needs exactly the document this function already fetched.
 * The shell renders a plan badge and a credit balance, both of which live in
 * the `getStateExternal` body that `readBillingState` just read. Returning it
 * lets the layout derive its summary with `summarizeBillingState` for free;
 * calling `getBillingSummary` afterwards instead would ask Polar for the same
 * document a second time, on every navigation, forever. `null` means there is
 * no document to hand back — no session, nothing provisioned, or a Polar that
 * could not be reached — and the summary that comes out of it is the same
 * honest "nothing is known" the rest of this module produces.
 *
 * # Why this never throws
 *
 * Provisioning billing is not what the user asked for. They asked to open the
 * application. Every failure in here — the session unreadable, Polar down, a
 * product id missing from the environment — leaves the user unprovisioned,
 * which the gate in `trigger/chat.ts` already has a defined answer for.
 * Letting any of it propagate would instead take down the app shell that
 * wraps every authenticated page, which is a far worse outcome than a missing
 * plan badge.
 *
 * `getSession()` and not `requireSession()`, for the same reason
 * `getBillingSummary` uses the equivalent read: `requireSession()` signals a
 * missing session by redirecting, which throws, and the catch below would
 * swallow that redirect rather than let Next perform it.
 *
 * # Why it is idempotent, and why that matters more than it looks
 *
 * This is called on every render of the application shell, not once per user,
 * and that is the point rather than a wasted round trip. Re-running the check
 * whenever the user shows up makes the system self-healing at the cost of one
 * state read the caller needed anyway.
 *
 * # The race is real
 *
 * Two tabs can open the app at the same instant, and both land here with no
 * customer yet. `externalId` is unique in Polar, so the second create is
 * rejected. That rejection is not a failure to report: it means somebody else
 * did the work. The loser re-reads the state, finds the customer, and returns
 * successfully rather than logging an error about a system that is now in
 * exactly the state it wanted.
 *
 * The winner is the one that subscribes, and the loser does not need to: the
 * re-read finds the subscription already there.
 *
 * # Why the check is "subscribed", not "exists"
 *
 * Provisioning is two writes against a system that can fail between them, so
 * the check has to describe the end state rather than the first step. Asking
 * whether a customer exists makes the second write unrepeatable — the customer
 * is there, so nothing tries again, and the missing subscription is invisible
 * forever. Asking whether the user is SUBSCRIBED makes both writes
 * individually recoverable: a customer without a plan is simply the next thing
 * this function fixes, the next time the user opens the app.
 */
/**
 * In-process de-duplication of concurrent provisioning attempts.
 *
 * The application shell calls `ensureBillingCustomer` from every render of
 * the authenticated layout, and a single navigation renders more than one
 * server component that reaches it. Every one of those calls used to see "not
 * subscribed" and race each other to `polar.subscriptions.create` — see the
 * note on the catch below about why Polar does not stop that. Keying the
 * in-flight promise by user id means the second and third call in the same
 * server process await the first one's result instead of repeating its
 * writes. It does nothing across processes or across page loads that do not
 * overlap, which is what `dedupeFreeSubscriptions` below is for.
 */
const provisioning = new Map<string, Promise<CustomerState | null>>()

/**
 * Keeps at most one active free subscription per user, revoking the rest.
 *
 * # Why free subscriptions, and never anything else
 *
 * A Pro subscription is money that already changed hands; revoking one this
 * function did not create would be an unrequested cancellation, not a
 * cleanup. The free plan is granted, not bought, so it is the only product
 * this ever touches — a hardcoded product id rather than "whatever the
 * duplicate happens to be" is what keeps that true even if this function is
 * ever reused.
 *
 * # Why the oldest survives
 *
 * The oldest subscription is the one any credit balance has already accrued
 * under. Keeping it and revoking newer duplicates changes nothing the user
 * can observe; the reverse would reset a relationship that predates the bug.
 *
 * # Why this runs on the already-provisioned path too, not only right after
 * a create
 *
 * The duplicates this cleans up did not all arrive moments apart — one
 * account accumulated twenty-six of them over the days this bug went
 * unnoticed. Limiting the cleanup to the moment of creation would stop the
 * leak without ever draining what it had already produced.
 *
 * # Why this never throws
 *
 * Same contract as `ensureBillingCustomer`: a failed cleanup must not turn
 * into a broken app shell. The caller gets back the best state available —
 * freshly re-read if the revoke succeeded, the one it already had otherwise —
 * and the next render tries again.
 */
async function dedupeFreeSubscriptions(
  userId: string,
  state: CustomerState
): Promise<CustomerState> {
  const freeSubscriptions = activeSubscriptionsForProduct(
    state,
    POLAR_PRODUCT_FREE_ID
  )

  if (freeSubscriptions.length <= 1) return state

  const [, ...duplicates] = freeSubscriptions

  try {
    await Promise.all(
      duplicates.map((subscription) =>
        polar.subscriptions.revoke({ id: subscription.id })
      )
    )

    const after = await readBillingState(userId)

    return after.status === "provisioned" ? after.state : state
  } catch (error) {
    console.error("Failed to revoke duplicate free subscriptions", error)

    return state
  }
}

async function provisionBillingCustomer(
  userId: string,
  identity: { name: string; email: string }
): Promise<CustomerState | null> {
  const state = await readBillingState(userId)

  if (state.status === "unreachable") return null

  if (state.status === "provisioned" && state.subscribed) {
    return await dedupeFreeSubscriptions(userId, state.state)
  }

  if (state.status === "missing") {
    try {
      await polar.customers.create({
        type: "individual",
        externalId: userId,
        name: identity.name,
        email: identity.email,
      })
    } catch (error) {
      /**
       * Either the concurrent-tab race above, or a genuine failure. Re-read
       * to tell them apart: a customer that now exists means somebody else
       * won the race, and this call carries on to the subscription — which is
       * safe, because the branch below tolerates the winner having got there
       * first.
       */
      const after = await readBillingState(userId)

      if (after.status !== "provisioned") throw error
      if (after.subscribed) {
        return await dedupeFreeSubscriptions(userId, after.state)
      }
    }
  }

  try {
    await polar.subscriptions.create({
      productId: POLAR_PRODUCT_FREE_ID,
      externalCustomerId: userId,
    })
  } catch (error) {
    /**
     * A genuine failure, or the race described above: two calls reaching this
     * line before either has committed. Polar does NOT refuse a second
     * subscription on an already-subscribed customer — verified against the
     * sandbox, which accepted two free subscriptions back to back, and an
     * account that had accumulated twenty-six of them is the reason
     * `dedupeFreeSubscriptions` exists. So this catch cannot assume the error
     * means "already subscribed"; it re-reads instead. The question is
     * whether the user now has their plan, and the state endpoint answers
     * exactly that, while an error code only hints at it. Any duplicate this
     * race produces — including the one this very call may have just created
     * before failing — is cleaned up by the dedupe below before either caller
     * sees the result.
     */
    const after = await readBillingState(userId)

    if (after.status === "provisioned" && after.subscribed) {
      return await dedupeFreeSubscriptions(userId, after.state)
    }

    throw error
  }

  /**
   * One extra read, and only on the visit that actually provisioned. The
   * state fetched at the top of this function predates the writes just made —
   * handing it back would render a shell that says "no plan" to the very user
   * who was just granted one, and it would keep saying it until they navigated
   * again. This costs a round trip exactly once in a user's life.
   */
  const provisioned = await readBillingState(userId)

  return provisioned.status === "provisioned"
    ? await dedupeFreeSubscriptions(userId, provisioned.state)
    : null
}

export async function ensureBillingCustomer(): Promise<CustomerState | null> {
  try {
    const session = await getSession()

    /**
     * No session means there is nothing to bill. Elsewhere in this
     * application that state is benign — a signed-out caller never reaches
     * `listGames`, since `requireSession` redirects first — and it is benign
     * here too: the caller renders a shell with no plan and no balance, which
     * is the truth.
     */
    if (!session) return null

    const { user } = session
    const inFlight = provisioning.get(user.id)

    /**
     * Awaited rather than returned bare: a bare `return inFlight` would hand
     * back the shared promise without going through this function's own
     * `try`, so a rejection from the call that is actually doing the work
     * would reject every rider's call too instead of landing in the catch
     * below. Awaiting it here is what keeps "never throws" true for callers
     * who did not initiate the attempt.
     */
    if (inFlight) return await inFlight

    const attempt = provisionBillingCustomer(user.id, customerIdentity(user))

    provisioning.set(user.id, attempt)

    try {
      return await attempt
    } finally {
      provisioning.delete(user.id)
    }
  } catch (error) {
    /**
     * The SDK's error carries Polar's own response body, which belongs in the
     * server log and nowhere else. There is no caller to report to by design —
     * see the "never throws" note above.
     */
    console.error("Failed to provision Polar billing customer", error)

    return null
  }
}
