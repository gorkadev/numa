import { logger } from "@trigger.dev/sdk"
import { db } from "@workspace/db"
import { turnUsage } from "@workspace/db/schema"
import { eq } from "drizzle-orm"

import type { ModelEntryId } from "@/lib/ai/model-registry"
import { RATE_TABLE_VERSION, type TurnCost } from "@/lib/ai/pricing"
import { ingestTurnCredits } from "@/lib/polar/events"

/**
 * The append-only cost ledger's only writer.
 *
 * Like `./thread`, this runs inside the `chat.agent` task on Trigger.dev, where
 * there is no request-bound session — so the owning user cannot be read off
 * the caller and is resolved from the game row instead. The tenant boundary is
 * upstream: reaching this code requires a session-scoped token, minted only by
 * the actions in `lib/games/chat-actions.ts`, each of which refuses a game its
 * caller does not own.
 */

/**
 * The user a game belongs to, or `undefined` if the game is gone.
 *
 * One column, no `user_id` predicate, and that asymmetry with
 * `lib/games/queries.ts` is the point: this exists precisely for the callers
 * that have no session to derive the boundary from and must read it out of the
 * row instead. The tenant check happened upstream, when a session-scoped chat
 * token was minted for this game id — see the module note above.
 *
 * It lives here rather than in the trigger task because two callers now need
 * it: this module, to attribute a finished turn's cost, and the credit gate in
 * `trigger/chat.ts`, to decide whether the turn may start at all. A second copy
 * of the query in the task file would be one predicate away from disagreeing
 * with this one about what a game's owner is.
 */
export async function getGameUserId(
  gameId: string
): Promise<string | undefined> {
  const game = await db.query.games.findFirst({
    columns: { userId: true },
    where: (game, { eq }) => eq(game.id, gameId),
  })

  return game?.userId
}

/**
 * Records what one finished turn spent, and what that is estimated to have
 * cost. One row, never updated.
 *
 * This function does not throw. The whole body is wrapped, and that is a
 * deliberate decision about *this* function rather than a habit: the ledger is
 * measurement, not money. Nothing is charged from it and no access is gated on
 * it, so a failed insert costs an observation — while letting it propagate
 * would kill a turn the player is sitting in front of watching their game get
 * built. Losing a data point to save a build is the right trade.
 *
 * That trade has an expiry. The day anything is billed or gated from these
 * rows, a silently missing row stops being a gap in a chart and becomes free
 * usage — and this `catch` has to be revisited before that day, not after it.
 *
 * The same expiry now covers the Polar ingest below, which is swallowed for the
 * same reason and is acceptable on the same terms: while nothing is gated on a
 * credit balance, an event Polar never received costs an observation. Once
 * something is gated on it, unmetered usage IS free usage, and the difference
 * from a lost ledger row is that this one is repairable —
 * `credits_ingested_at` is the column that makes the backlog findable, and
 * replaying it is safe because the events deduplicate. What must not happen is
 * that day arriving with nobody replaying anything.
 *
 * `cost` is the FULL turn's price, already summed by `priceTurn` across the
 * orchestrator and every dispatched sub-agent — see `turn-usage-accounting`'s
 * Ledger and Polar Reflect the Full Turn requirement. `modelId` stays a
 * separate parameter: it is the orchestrator's own concrete entry, stamped on
 * the row's `model_id` column for the "which model ran this turn" question
 * (decision 10 in `design.md`), distinct from the per-agent detail that lives
 * in `usage_breakdown`.
 */
export async function recordTurnUsage({
  gameId,
  modelId,
  turn,
  runId,
  cost,
  finishReason,
  stopped,
}: {
  gameId: string
  modelId: ModelEntryId
  turn: number
  runId: string
  cost: TurnCost
  finishReason?: string
  stopped?: boolean
}): Promise<void> {
  try {
    /**
     * An empty breakdown means nothing in the turn ever produced usage — a
     * turn that failed before any model answered. There is nothing to record
     * and a row of zeros would be indistinguishable from a free turn, so
     * nothing is written.
     */
    if (cost.breakdown.length === 0) return

    /**
     * `user_id` is denormalized onto the ledger, so it has to be read here
     * rather than joined for later — see the column's comment in `schema.ts`.
     *
     * A game deleted between the turn finishing and this write is the one case
     * where the cost is genuinely unattributable: there is no user left to
     * charge it to and the column is `notNull`. Dropping the row is the only
     * option, and it is a narrow enough window to accept.
     */
    const userId = await getGameUserId(gameId)

    if (!userId) return

    const { credits } = cost

    /**
     * Three writes in a fixed order, and the order is the whole design.
     *
     * The local row goes first because it is this application's own record of
     * what happened. It has to exist whether or not Polar is reachable, and
     * making it wait on a third party would mean an outage there erases our
     * history here.
     *
     * The ingest goes second, and the timestamp third, so the timestamp can
     * only ever claim something that already happened. A crash in the gap
     * between them leaves a row that looks un-ingested when it was in fact
     * ingested — the safe direction, because the reconciliation query picks it
     * up and the replay costs nothing: `externalId` is `gameId:turn`, so Polar
     * recognises the duplicate and drops it.
     *
     * Reversing the two would be quietly catastrophic. Marking the row ingested
     * before the call returns means a failed call leaves work permanently
     * recorded as metered, invisible to the exact query built to find it, and
     * unbillable forever. One ordering loses a timestamp; the other loses the
     * money.
     */
    const [row] = await db
      .insert(turnUsage)
      .values({
        gameId,
        userId,
        modelId,
        turn,
        runId,
        inputTokens: cost.tokens.inputTokens,
        outputTokens: cost.tokens.outputTokens,
        cachedInputTokens: cost.tokens.cachedInputTokens,
        reasoningTokens: cost.tokens.reasoningTokens,
        costMicroUsd: cost.costMicroUsd,
        credits,
        /**
         * Stamped from the rate table that just produced the numbers above, so
         * they can never drift apart: a row always says which rates — and which
         * markup — explain it.
         */
        rateVersion: RATE_TABLE_VERSION,
        /**
         * The per-agent detail behind the totals above: which tier the turn
         * ran on, and, per run, its role, concrete model entry and priced
         * cost — see `turn-usage-accounting`'s Per-Sub-Agent Usage Breakdown
         * Retained requirement and decision 10 in `design.md`. `entries`
         * rather than reusing `TurnCost`'s own `breakdown` key: the column is
         * a stored fact, `{ tier, entries }`, independent of the in-memory
         * type's field name.
         */
        usageBreakdown: { tier: cost.tier, entries: cost.breakdown },
        finishReason,
        stopped: stopped ?? false,
      })
      .returning({ id: turnUsage.id })

    const ingested = await ingestTurnCredits({
      userId,
      gameId,
      turn,
      credits,
      modelId,
    })

    if (!ingested || !row) return

    await db
      .update(turnUsage)
      .set({ creditsIngestedAt: new Date() })
      .where(eq(turnUsage.id, row.id))
  } catch (error) {
    logger.error("Failed to record turn usage", { gameId, turn, runId, error })
  }
}
