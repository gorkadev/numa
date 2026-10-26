import { logger, schedules } from "@trigger.dev/sdk"
import { db } from "@workspace/db"
import { promptImprovements, turnUsage } from "@workspace/db/schema"
import { and, asc, eq, gt, isNull, lt } from "drizzle-orm"

import {
  ingestImprovementCredits,
  ingestTurnCredits,
} from "@/lib/polar/events"
import { replayUnbilled } from "@/lib/polar/replay"

/**
 * Rows younger than this may still have their first ingest in flight; they
 * are left to it. Replaying them would be harmless — Polar dedupes on the
 * same key — but pointless.
 */
const MIN_AGE_MS = 10 * 60 * 1000

/** A bound per run, so a long outage drains over several runs. */
const BATCH = 500

/**
 * Resends to Polar every charge it never acknowledged, from both credit
 * ledgers: `credits > 0 and credits_ingested_at is null`. See
 * `replayUnbilled` for why a replay can never bill twice.
 */
export const replayUnbilledCredits = schedules.task({
  id: "replay-unbilled-credits",
  cron: "0 * * * *",
  run: async () => {
    const before = new Date(Date.now() - MIN_AGE_MS)

    const result = await replayUnbilled({
      pendingTurns: () =>
        db
          .select({
            id: turnUsage.id,
            userId: turnUsage.userId,
            gameId: turnUsage.gameId,
            runId: turnUsage.runId,
            turn: turnUsage.turn,
            credits: turnUsage.credits,
            modelId: turnUsage.modelId,
          })
          .from(turnUsage)
          .where(
            and(
              gt(turnUsage.credits, 0),
              isNull(turnUsage.creditsIngestedAt),
              lt(turnUsage.createdAt, before)
            )
          )
          .orderBy(asc(turnUsage.createdAt))
          .limit(BATCH),
      pendingImprovements: () =>
        db
          .select({
            id: promptImprovements.id,
            userId: promptImprovements.userId,
            credits: promptImprovements.credits,
            modelId: promptImprovements.modelId,
          })
          .from(promptImprovements)
          .where(
            and(
              gt(promptImprovements.credits, 0),
              isNull(promptImprovements.creditsIngestedAt),
              lt(promptImprovements.createdAt, before)
            )
          )
          .orderBy(asc(promptImprovements.createdAt))
          .limit(BATCH),
      ingestTurn: ingestTurnCredits,
      ingestImprovement: ingestImprovementCredits,
      markTurn: async (id) => {
        await db
          .update(turnUsage)
          .set({ creditsIngestedAt: new Date() })
          .where(eq(turnUsage.id, id))
      },
      markImprovement: async (id) => {
        await db
          .update(promptImprovements)
          .set({ creditsIngestedAt: new Date() })
          .where(eq(promptImprovements.id, id))
      },
    })

    if (result.failed > 0) {
      logger.warn("Some charges are still unbilled", result)
    } else {
      logger.log("Unbilled charges replayed", result)
    }

    return result
  },
})
