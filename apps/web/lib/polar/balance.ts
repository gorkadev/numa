import { polar } from "./client"
import { POLAR_METER_ID } from "./products"

/**
 * What this application knows about an organization's credit balance.
 *
 * Three cases, and keeping them three is the entire reason this type exists.
 * The obvious signature — `Promise<number>` — forces every failure to become a
 * number, and there are only two numbers to pick from and both are wrong. Zero
 * on a network error refuses paying customers every time Polar has a bad
 * minute. `Infinity`, or any "assume they're fine" default, hands out free
 * usage to anyone who can make a request fail.
 *
 * The distinction is not about caution, it is about what is actually true. A
 * balance of zero is an ANSWER: Polar was asked, Polar replied, the
 * organization has spent everything it was granted. `"unavailable"` is the
 * absence of an answer — the question was never successfully asked, and the
 * balance behind it might be zero or might be ten thousand. Collapsing those
 * two into the same value destroys the only information a caller needs to
 * decide how to behave, which is precisely the decision `trigger/chat.ts`
 * makes: it enforces the answer and forgives the ignorance.
 *
 * `"unprovisioned"` is a third fact rather than a flavour of zero. No Polar
 * customer exists for this organization at all, so there is no entitlement, no
 * meter and no subscription — nothing was ever granted, as opposed to granted
 * and spent. It is separated because it is repairable by a completely different
 * action (`ensureBillingCustomer`) than an exhausted balance is (buy more), and
 * a caller that cannot tell them apart cannot say anything useful about either.
 */
export type CreditBalance =
  | { status: "ok"; balance: number }
  | { status: "unprovisioned" }
  | { status: "unavailable" }

/**
 * Reads the `Game credits` meter for one organization.
 *
 * # This number is behind, always
 *
 * Polar's meter balance is eventually consistent. Measured against the sandbox,
 * an ingested event takes between four and ten seconds to move the balance this
 * call returns. That is not a bug to work around, it is the contract, and every
 * caller has to be written knowing it.
 *
 * The consequence is concrete: this function cannot prevent an overdraft, it
 * can only bound one. Two tabs starting a turn within the same few seconds both
 * read the pre-spend balance, both see credits, and both run. So do a tab and a
 * retry. What a check here buys is a ceiling on how far negative that can go —
 * an organization at zero is stopped within seconds rather than continuing
 * indefinitely — and that is worth having while a single turn is worth cents.
 *
 * Closing the gap properly means a RESERVATION: deducting the turn's expected
 * cost at turn start, against a store this application controls and can read
 * back synchronously, and releasing or reconciling it when the turn ends. That
 * is deliberately not built here. It is a real ledger with its own failure
 * modes — orphaned holds from crashed runs, expiry, reconciliation against
 * Polar's authoritative number — and it should be built when the exposure
 * justifies it, not pre-emptively. The trigger to build it is the amount at
 * stake per turn, not the existence of this comment.
 *
 * # Failures
 *
 * A 404 is the documented answer for an `externalId` Polar has never seen, so
 * it maps to `"unprovisioned"` rather than to an error. Everything else —
 * network, auth, an unexpected response shape — is `"unavailable"`, because
 * this function has no way to tell a Polar outage from a broken token and the
 * caller's answer is the same either way: it did not get an answer.
 *
 * A customer with no matching meter reports `{ status: "ok", balance: 0 }`, and
 * that is a fact rather than a fallback. `activeMeters` lists the meters this
 * customer has been credited against; absence from it means nothing was ever
 * granted on that meter, which is zero available credits. It is reached by a
 * customer created but never subscribed — see the gap named in
 * `./customers.ts`.
 */
export async function getCreditBalance(orgId: string): Promise<CreditBalance> {
  try {
    const state = await polar.customers.getStateExternal({ externalId: orgId })

    const meter = state.activeMeters.find(
      (meter) => meter.meterId === POLAR_METER_ID
    )

    return { status: "ok", balance: meter?.balance ?? 0 }
  } catch (error) {
    /**
     * Duck-typed rather than an `instanceof ResourceNotFound`. The status code
     * is on the SDK's error base class and is stable across every error variant
     * Polar defines, whereas the variant classes live behind deep subpath
     * imports that are part of the SDK's generated layout and not of its
     * published surface.
     */
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 404
    ) {
      return { status: "unprovisioned" }
    }

    return { status: "unavailable" }
  }
}
