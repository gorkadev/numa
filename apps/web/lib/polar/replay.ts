type UnbilledTurn = {
  id: string
  userId: string
  gameId: string
  runId: string
  turn: number
  credits: number
  modelId: string
}

type UnbilledImprovement = {
  id: string
  userId: string
  credits: number
  modelId: string
}

/**
 * The two ledgers that charge credits, seen from the replay: rows with
 * `credits > 0 and credits_ingested_at is null`, the ingest that bills them,
 * and the stamp that marks them billed.
 */
export type UnbilledLedger = {
  pendingTurns(): Promise<UnbilledTurn[]>
  pendingImprovements(): Promise<UnbilledImprovement[]>
  ingestTurn(row: Omit<UnbilledTurn, "id">): Promise<boolean>
  ingestImprovement(row: {
    userId: string
    improvementId: string
    credits: number
    modelId: string
  }): Promise<boolean>
  markTurn(id: string): Promise<void>
  markImprovement(id: string): Promise<void>
}

/**
 * Resends every charge Polar never acknowledged. Each row goes out under the
 * same `externalId` its first attempt used (`gameId:runId:turn` for a turn,
 * the row id for an improvement), so a charge Polar did receive — and only the
 * stamp was lost — is deduplicated by Polar instead of billed twice.
 *
 * Rows are independent: one that fails stays unbilled for the next run and
 * never stops the rest.
 */
export async function replayUnbilled(
  ledger: UnbilledLedger
): Promise<{ resent: number; failed: number }> {
  const [turns, improvements] = await Promise.all([
    ledger.pendingTurns(),
    ledger.pendingImprovements(),
  ])
  const charges = [
    ...turns.map(({ id, ...row }) => ({
      ingest: () => ledger.ingestTurn(row),
      mark: () => ledger.markTurn(id),
    })),
    ...improvements.map(({ id, ...row }) => ({
      ingest: () => ledger.ingestImprovement({ ...row, improvementId: id }),
      mark: () => ledger.markImprovement(id),
    })),
  ]

  let resent = 0
  let failed = 0
  for (const charge of charges) {
    const accepted = await charge.ingest().catch(() => false)
    if (!accepted) {
      failed++
      continue
    }
    resent++
    // Polar has the charge; a lost stamp only means it is resent next run.
    await charge.mark().catch(() => undefined)
  }

  return { resent, failed }
}
