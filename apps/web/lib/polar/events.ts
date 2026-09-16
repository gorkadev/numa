import { polar } from "./client"

/**
 * The name every game turn is metered under.
 *
 * This is not a label, it is half of a join. The `Game credits` meter in Polar
 * selects the events it counts with the filter `name eq "game_turn"`, and that
 * filter lives in Polar's dashboard, not in this repository. The two strings
 * agree because somebody made them agree, and nothing in either system checks
 * that they still do.
 *
 * Renaming this constant without editing the meter is therefore not a rename —
 * it is a disconnection, and a completely silent one. Polar keeps accepting the
 * events, because an event name is free-form as far as ingestion is concerned.
 * The meter keeps reporting a number, because a filter that matches nothing
 * sums to zero rather than failing. Customers keep playing, keep consuming
 * credits, and keep being charged for none of them. There is no error, no
 * rejected request and no failed job anywhere in that sequence — the first
 * symptom is revenue that does not arrive, noticed whenever somebody next
 * happens to look.
 */
export const GAME_TURN_EVENT_NAME = "game_turn"

/**
 * The metadata property the meter aggregates.
 *
 * Same contract as the event name above and the same failure mode: the meter's
 * aggregation is `sum` over the metadata property `credits`, and a property by
 * any other key is simply not the one being summed. An event carrying
 * `{ credit: 12 }` is a perfectly valid event that contributes exactly zero to
 * the meter.
 *
 * If either of these two strings changes here, it changes in the Polar meter in
 * the same breath, or every subsequent event is orphaned.
 */
export const CREDITS_METADATA_PROPERTY = "credits"

/**
 * Tells Polar that a user spent credits on one turn.
 *
 * Returns whether Polar accepted the event, and never throws — a metering call
 * is not allowed to take down a turn the player is watching get built. The
 * caller records that answer, which is what makes a failure recoverable rather
 * than merely survived; see `turn_usage.credits_ingested_at`.
 *
 * `externalCustomerId` is the Better Auth user id, and it is the same value
 * `app/checkout/route.ts` puts on the checkout session. That is not a
 * coincidence to preserve casually: Polar has no idea what this application's
 * user id is, and the only thing tying the subscription that GRANTS credits to
 * the meter reading that SPENDS them is that both name the customer
 * identically. If these two call sites ever disagree the grant lands on one
 * Polar customer and the usage on another. Both customers look fine in
 * isolation: one has a balance nothing draws down, the other has usage against
 * no entitlement.
 *
 * `externalId` is `gameId:turn` and exists purely for DEDUPLICATION. Turns are
 * retried — the Trigger.dev run can fail and run again — and `turn` numbers are
 * not unique on their own; the column's comment in `schema.ts` says outright
 * that a retried run can repeat a number. Without a stable key, one retry bills
 * the customer twice for a single piece of work, and the second charge is
 * indistinguishable from real usage after the fact. This key is stable across
 * retries by construction, because both halves are decided before the turn runs
 * rather than derived from the attempt, so Polar collapses the duplicates
 * itself and a replay of the whole backlog costs nothing.
 */
export async function ingestTurnCredits({
  userId,
  gameId,
  turn,
  credits,
  modelId,
}: {
  userId: string
  gameId: string
  turn: number
  credits: number
  modelId: string
}): Promise<boolean> {
  /**
   * Zero credits is not a failure and not something to report. A turn that cost
   * nothing meters nothing, and an event summing to zero is noise the meter has
   * to carry forever in exchange for saying nothing.
   */
  if (credits <= 0) return false

  try {
    await polar.events.ingest({
      events: [
        {
          name: GAME_TURN_EVENT_NAME,
          externalCustomerId: userId,
          externalId: `${gameId}:${turn}`,
          metadata: {
            [CREDITS_METADATA_PROPERTY]: credits,
            model: modelId,
            game_id: gameId,
          },
        },
      ],
    })

    return true
  } catch {
    return false
  }
}

/**
 * Claws back the unearned share of a Pro→Max upgrade's credit grant.
 *
 * # The exploit this closes
 *
 * `polar.subscriptions.update` with `prorationBehavior: "invoice"` — the call
 * `changePlanAction` makes for a Pro→Max upgrade — charges the prorated price
 * difference correctly, but Polar revokes the Pro `meter_credit` benefit and
 * grants the Max one IN FULL, regardless of how much of the billing cycle is
 * left. A sandbox run one day into a 30-day cycle charged about $1 and still
 * handed over the full +3500 credits Max grants over Pro, because the benefit
 * swap is an unconditional revoke-then-grant with no proration logic of its
 * own. Upgrading on the last day of a cycle is therefore nearly free credits,
 * and nothing in Polar's own billing catches it — see `lib/polar/plan-
 * change.ts` for the math that turns "how much of the cycle is left" into how
 * many of those extra credits the customer has actually paid for.
 *
 * This function is how the difference gets taken back: it ingests a metering
 * event for the UNPAID portion of the extra credits, exactly as if the
 * customer had spent them on a turn. The meter has no notion of a "grant"
 * separate from "usage" — a balance is just credited minus consumed — so the
 * only lever available to correct an over-grant is to consume the excess.
 *
 * # Why this reuses `GAME_TURN_EVENT_NAME` and `CREDITS_METADATA_PROPERTY`
 *
 * The `Game credits` meter's filter is `name eq "game_turn"`, and Polar
 * refuses to change a meter's filter once it has started aggregating events
 * — a sandbox attempt to add a second event name came back "This field can't
 * be updated because the meter is already aggregating events." There is
 * therefore no such thing as a differently-named event this meter will ever
 * count; `game_turn` is not a label being reused for convenience, it is the
 * only name that reaches this meter at all. `reason` and `subscription_id`
 * ride along in metadata as context for anyone reading Polar's event log
 * later, but only `credits` under `CREDITS_METADATA_PROPERTY` is ever summed.
 *
 * # Why `externalId` is keyed on the subscription and the period, not a turn
 *
 * `ingestTurnCredits` dedupes on `gameId:turn` because a turn can retry. A
 * plan-change adjustment has no retry of that shape — `changePlanAction`
 * calls this at most once per successful `subscriptions.update` — but the
 * Server Action itself is reachable as a raw POST (see that function's own
 * note on why its target product id is validated rather than trusted), and a
 * duplicate call must not double-clawback the same upgrade. A Pro→Max
 * upgrade can only ever happen once per subscription per billing period —
 * a downgrade back to Pro takes effect at the NEXT period rather than
 * reopening this one — so `subscriptionId` plus the period's start is a key
 * that is stable across retries and can never collide with a genuinely
 * different upgrade.
 *
 * # Same contract as `ingestTurnCredits`
 *
 * Returns whether Polar accepted the event and never throws, for the same
 * reason: a metering call must not be allowed to fail the upgrade it is
 * correcting after the customer has already been charged. `changePlanAction`
 * retries a `false` result a few times and logs the amount for manual
 * correction if every attempt fails — see that function's own note on why a
 * failed clawback only ever costs this application, never the customer.
 */
export async function ingestPlanUpgradeAdjustment({
  userId,
  subscriptionId,
  periodStart,
  credits,
}: {
  userId: string
  subscriptionId: string
  periodStart: Date
  credits: number
}): Promise<boolean> {
  /**
   * A non-positive clawback means the customer kept nothing they had not
   * already paid for — the caller already checks this before deciding to call
   * at all, but the guard is repeated here for the same reason it is repeated
   * on `ingestTurnCredits`: an event summing to zero or less is noise the
   * meter would carry forever for saying nothing.
   */
  if (credits <= 0) return false

  try {
    await polar.events.ingest({
      events: [
        {
          name: GAME_TURN_EVENT_NAME,
          externalCustomerId: userId,
          externalId: `plan-upgrade:${subscriptionId}:${periodStart.toISOString()}`,
          metadata: {
            [CREDITS_METADATA_PROPERTY]: credits,
            reason: "plan_upgrade_proration",
            subscription_id: subscriptionId,
          },
        },
      ],
    })

    return true
  } catch {
    return false
  }
}
