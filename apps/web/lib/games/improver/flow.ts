import type { BillingPlan } from "@/lib/polar/plan"

import {
  canImprove,
  improverAllowance,
  type ImproverAllowance,
} from "./allowance"

export type ImproveOutcome =
  | { ok: true; text: string; credits: number; allowance: ImproverAllowance }
  | { ok: false; error: "denied" | "failed"; allowance: ImproverAllowance }

/** The ledger as seen from inside the per-user lock. */
export type LockedLedger = {
  /** Improvements recorded today, claimed ones included. */
  countToday(): Promise<number>
  /** Records one use before the model runs and returns its row id. */
  claim(): Promise<string>
}

export type ImprovementFlow<Generated extends { text: string | null }> = {
  now: Date
  /** Plan, balance and opt-in: read once, outside the lock. */
  readAccount(): Promise<{
    plan: BillingPlan
    balance: number | null
    overageBilling: boolean
  }>
  withUserLock<T>(fn: (ledger: LockedLedger) => Promise<T>): Promise<T>
  generate(): Promise<Generated>
  /** Writes the usage and price onto the claimed row; returns its credits. */
  settle(claimId: string, generated: Generated, charged: boolean): Promise<number>
  /** Deletes a claimed row whose improvement never happened. */
  release(claimId: string): Promise<void>
  ingest(charge: { claimId: string; credits: number }): Promise<boolean>
  markIngested(claimId: string): Promise<void>
  log(message: string, error: unknown): void
}

/**
 * One improvement against the daily quota. The count, the decision and the
 * claim of a ledger row happen under one per-user lock, so parallel calls
 * cannot all read the same count and spend the same last free use. The lock
 * is released before the model runs; a call that produces nothing gives its
 * claimed row back.
 *
 * Once Polar has accepted the charge the improvement is delivered no matter
 * what: a failed `markIngested` leaves the row looking unbilled, which the
 * backlog replay resends and Polar deduplicates by the row id.
 */
export async function runImprovement<Generated extends { text: string | null }>(
  flow: ImprovementFlow<Generated>
): Promise<ImproveOutcome> {
  const account = await flow.readAccount()
  const decide = (usedToday: number) =>
    improverAllowance({ ...account, usedToday, now: flow.now })

  const { usedToday, allowance, claimId } = await flow.withUserLock(
    async (ledger) => {
      const usedToday = await ledger.countToday()
      const allowance = decide(usedToday)
      const claimId = canImprove(allowance) ? await ledger.claim() : null
      return { usedToday, allowance, claimId }
    }
  )
  if (!claimId) return { ok: false, error: "denied", allowance }

  let text: string
  let credits: number
  try {
    const generated = await flow.generate()
    if (!generated.text) {
      await flow.release(claimId)
      return { ok: false, error: "failed", allowance }
    }
    text = generated.text
    credits = await flow.settle(claimId, generated, allowance.kind === "charged")
  } catch (error) {
    flow.log("Prompt improvement failed", error)
    await flow.release(claimId).catch((releaseError: unknown) =>
      flow.log("Releasing a claimed improvement failed", releaseError)
    )
    return { ok: false, error: "failed", allowance }
  }

  if (credits > 0 && (await flow.ingest({ claimId, credits }))) {
    await flow.markIngested(claimId).catch((error: unknown) =>
      flow.log("Marking a charged improvement as ingested failed", error)
    )
  }

  return {
    ok: true,
    text,
    credits,
    allowance: improverAllowance({
      ...account,
      usedToday: usedToday + 1,
      balance: account.balance === null ? null : account.balance - credits,
      now: flow.now,
    }),
  }
}
