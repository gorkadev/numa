import { auth, clerkClient, currentUser } from "@clerk/nextjs/server"

import { polar } from "./client"
import type { CustomerState } from "./plan"
import { POLAR_PRODUCT_FREE_ID } from "./products"

/**
 * What Polar currently knows about this organization.
 *
 * Three answers, not two, and the third is the one that matters. "The customer
 * exists" is not the same question as "the organization has its free plan", and
 * an earlier version of this file asked the first while meaning the second.
 * That bug is worth naming because it was silent and permanent: if the customer
 * create succeeded and the subscription create then failed, every later call
 * saw a customer, returned early, and the free plan was never granted. The
 * organization sat there forever with a customer, no entitlement and a balance
 * of zero, and the only symptom was a user being refused credits nobody had
 * ever given them.
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

async function readBillingState(orgId: string): Promise<BillingState> {
  try {
    const state = await polar.customers.getStateExternal({ externalId: orgId })

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
 * The organization's display name, or `undefined` if Clerk cannot be reached.
 *
 * Purely cosmetic — it is what somebody reading the Polar dashboard sees
 * instead of a `org_2abc...` string. The identity is `externalId` and nothing
 * else, so a customer created without a name is a fully functional customer
 * with an ugly label, and that is never worth failing a provisioning over.
 *
 * `auth()` carries `orgSlug` but not `orgName`, so this costs a Backend API
 * call. It is one call, the first time an organization ever opens the app.
 */
async function organizationName(orgId: string): Promise<string | undefined> {
  try {
    const client = await clerkClient()
    const organization = await client.organizations.getOrganization({
      organizationId: orgId,
    })

    return organization.name
  } catch {
    return undefined
  }
}

/**
 * The signed-in user's primary email address, or `undefined`.
 *
 * Falls back to the first address on the account because `primaryEmailAddressId`
 * is nullable — a user who signed up with an OAuth provider that returned no
 * verified primary still has an inbox this can reach.
 */
async function primaryContactEmail(): Promise<string | undefined> {
  try {
    const user = await currentUser()

    return (
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress
    )
  } catch {
    return undefined
  }
}

/**
 * Gives this organization a Polar customer and a free-plan subscription, once,
 * and answers with the customer state it ended up with.
 *
 * # Why the customer is an organization with a person's email
 *
 * Polar's customer is the thing that gets billed, and the thing that gets
 * billed here is a team: `games.orgId` is the tenant boundary every read in
 * `lib/games/queries.ts` filters on, the checkout in `app/checkout/route.ts`
 * pays as an org, and the meter events in `lib/polar/events.ts` are attributed
 * to an org. A per-user customer would split one team's credits across however
 * many people happen to be in it and would lose the subscription the day the
 * person who bought it left.
 *
 * But only a person has an inbox. Polar requires a `team` customer to carry
 * either an email or an owner with one — it will not create an unreachable
 * customer, and it validates the domain with real MX lookups rather than a
 * regex, so a plausible-looking placeholder is rejected outright. So the email
 * is the current user's.
 *
 * That is a CONTACT ADDRESS, not an identity, and the distinction is the whole
 * design. `externalId` is the identity, it is the Clerk organization id, and it
 * is immutable in Polar once set. Nothing downstream ever looks the customer up
 * by email. The person whose address seeded the customer can leave, be removed,
 * or change their address, and the organization keeps its subscription, its
 * meter and its balance, because none of those were ever keyed on them.
 *
 * # Why this runs on entry to the app, and not from a webhook
 *
 * The obvious place to provision is a Clerk `organization.created` webhook, and
 * it is the wrong one for three separate reasons, any one of which is fatal on
 * its own.
 *
 * A webhook has exactly ONE chance. If the delivery fails, or Polar is down for
 * the second it takes to handle, nothing anywhere notices: the organization
 * exists forever with no customer, and the first symptom is a user being
 * refused a turn for credits nobody ever granted them. There is no second
 * attempt because there is no second `organization.created`.
 *
 * A webhook cannot help an organization that already EXISTS. Every org created
 * before the webhook was written — which, when this moved here, was all of
 * them, including the repository owner's — is permanently outside its reach.
 * Backfilling them means a one-off script, and a one-off script is a thing
 * somebody has to remember to run again the next time provisioning changes.
 *
 * And a webhook needs a public HTTPS URL Clerk can reach. This project does not
 * have one yet, so during local development the free plan would simply never be
 * granted, and the difference between "works on my machine" and "works in
 * production" would be the product's entire billing setup.
 *
 * Provisioning on entry to the application shell has none of those problems. It
 * is self-healing: every navigation is another chance, so a failure costs a
 * page load rather than an organization. It covers orgs of every vintage,
 * because it asks about the org in front of it rather than about an event that
 * may have happened years ago. And it needs no infrastructure at all.
 *
 * # Why a write during a layout render is acceptable HERE
 *
 * The general rule against mutating from a render is a good one and this is a
 * real exception to it, not an oversight. The write is idempotent, so a render
 * that happens twice — React, a retry, two tabs — converges on the same state
 * rather than compounding. It is SKIPPED entirely on the overwhelmingly common
 * path: an organization that already has its plan costs one state read and
 * returns, and after the first visit that is every visit forever. And the
 * alternative is not "a cleaner render", it is a user who cannot use the
 * product at all — no subscription, no credits, and a chat that refuses every
 * turn with no action available in the UI to fix it.
 *
 * # Why the state is returned rather than re-read
 *
 * Because the caller needs exactly the document this function already fetched.
 * The shell renders a plan badge and a credit balance, both of which live in
 * the `getStateExternal` body that `readBillingState` just read. Returning it
 * lets the layout derive its summary with `summarizeBillingState` for free;
 * calling `getBillingSummary` afterwards instead would ask Polar for the same
 * document a second time, on every navigation, forever. `null` means there is
 * no document to hand back — no organization, nothing provisioned, or a Polar
 * that could not be reached — and the summary that comes out of it is the same
 * honest "nothing is known" the rest of this module produces.
 *
 * # Why this never throws
 *
 * Provisioning billing is not what the user asked for. They asked to open the
 * application. Every failure in here — Clerk unreachable, Polar down, a product
 * id missing from the environment — leaves the organization unprovisioned,
 * which the gate in `trigger/chat.ts` already has a defined answer for. Letting
 * any of it propagate would instead take down the app shell that wraps every
 * authenticated page, which is a far worse outcome than a missing plan badge.
 *
 * `auth()` and not `auth.protect()`, for the same reason `getBillingSummary`
 * uses it: this runs for a signed-in user who may have no active organization,
 * a state this application treats as benign everywhere. It matters twice as
 * much here, because `auth.protect()` signals its redirect by throwing, and the
 * catch below would swallow that redirect rather than let Next perform it.
 *
 * # Why it is idempotent, and why that matters more than it looks
 *
 * This is called on every render of the application shell, not once per
 * organization, and that is the point rather than a wasted round trip. Re-
 * running the check whenever the org shows up makes the system self-healing at
 * the cost of one state read the caller needed anyway.
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
 * forever. Asking whether the organization is SUBSCRIBED makes both writes
 * individually recoverable: a customer without a plan is simply the next thing
 * this function fixes, the next time the organization opens the app.
 */
export async function ensureBillingCustomer(): Promise<CustomerState | null> {
  try {
    const { orgId } = await auth()

    /**
     * No active organization means there is nothing to bill. Elsewhere in this
     * application that state is benign — `listGames` answers with an empty
     * list — and it is benign here too: the caller renders a shell with no plan
     * and no balance, which is the truth.
     */
    if (!orgId) return null

    const state = await readBillingState(orgId)

    if (state.status === "unreachable") return null
    if (state.status === "provisioned" && state.subscribed) return state.state

    if (state.status === "missing") {
      const email = await primaryContactEmail()

      /**
       * No address, no customer. Polar would reject the create anyway, and
       * sending it something invalid to hear that from the API is a round trip
       * that buys nothing. Returning leaves the org unprovisioned and the next
       * page load tries again — by which point the user may well have added an
       * address.
       */
      if (!email) return null

      const name = await organizationName(orgId)

      try {
        await polar.customers.create({
          type: "team",
          externalId: orgId,
          name,
          email,
        })
      } catch (error) {
        /**
         * Either the concurrent-tab race above, or a genuine failure. Re-read
         * to tell them apart: a customer that now exists means somebody else
         * won the race, and this call carries on to the subscription — which is
         * safe, because the branch below tolerates the winner having got there
         * first.
         */
        const after = await readBillingState(orgId)

        if (after.status !== "provisioned") throw error
        if (after.subscribed) return after.state
      }
    }

    try {
      await polar.subscriptions.create({
        productId: POLAR_PRODUCT_FREE_ID,
        externalCustomerId: orgId,
      })
    } catch (error) {
      /**
       * Polar refuses a second subscription on an already-subscribed customer,
       * and under the race above that refusal is the correct outcome rather
       * than a problem — somebody granted the plan a moment ago. Re-read rather
       * than parse the error: the question is whether the organization now has
       * its plan, and the state endpoint answers exactly that, while an error
       * code only hints at it.
       */
      const after = await readBillingState(orgId)

      if (after.status === "provisioned" && after.subscribed) return after.state

      throw error
    }

    /**
     * One extra read, and only on the visit that actually provisioned. The
     * state fetched at the top of this function predates the writes just made —
     * handing it back would render a shell that says "no plan" to the very user
     * who was just granted one, and it would keep saying it until they navigated
     * again. This costs a round trip exactly once in an organization's life.
     */
    const provisioned = await readBillingState(orgId)

    return provisioned.status === "provisioned" ? provisioned.state : null
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
