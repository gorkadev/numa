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
 * Tells Polar that an organization spent credits on one turn.
 *
 * Returns whether Polar accepted the event, and never throws — a metering call
 * is not allowed to take down a turn the player is watching get built. The
 * caller records that answer, which is what makes a failure recoverable rather
 * than merely survived; see `turn_usage.credits_ingested_at`.
 *
 * `externalCustomerId` is the Clerk organization id, and it is the same value
 * `app/checkout/route.ts` puts on the checkout session. That is not a
 * coincidence to preserve casually: Polar has no idea what a Clerk org is, and
 * the only thing tying the subscription that GRANTS credits to the meter
 * reading that SPENDS them is that both name the customer identically. If these
 * two call sites ever disagree — a user id here, an org id there — the grant
 * lands on one Polar customer and the usage on another. Both customers look
 * fine in isolation: one has a balance nothing draws down, the other has usage
 * against no entitlement.
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
  orgId,
  gameId,
  turn,
  credits,
  modelId,
}: {
  orgId: string
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
          externalCustomerId: orgId,
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
