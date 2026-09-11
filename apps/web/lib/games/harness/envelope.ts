import type { AgentUsageEntry, EnvelopeStatus } from "@/lib/ai/pricing"

/**
 * Both types are owned by `lib/ai/pricing.ts` — `priceTurn`/`turnCostMicroUsd`
 * are what actually build and read an `AgentUsageEntry`, and `lib/ai` must
 * never import from `lib/games`. Re-exported here, not redeclared, so a
 * harness caller never has to know the type lives one layer down.
 */
export type { AgentUsageEntry, EnvelopeStatus }

/**
 * What the verifier (unit 6) can add to an envelope on top of the
 * code-decided console verdict: a visual finding tied back to the task that
 * owns the file it concerns. Minimal placeholder shape — unit 6 owns its full
 * definition — declared here only because `SubagentEnvelope` (design.md's
 * Interfaces section) already references it.
 */
export type Finding = {
  message: string
  severity: "error" | "warning"
  taskId?: string
}

/**
 * The compact result every dispatch tool returns to the orchestrator's model
 * (`agent-orchestration`'s Compact Result Envelope requirement): a status,
 * a summary usable in the reply, and enough detail to decide the next phase
 * — never the sub-agent's full step-by-step transcript. `agent` names the
 * run (its `agentId`).
 */
export type SubagentEnvelope = {
  agent: string
  status: EnvelopeStatus
  summary: string
  edits?: string[]
  artifacts?: string[]
  findings?: Finding[]
}

/**
 * Ceiling on the envelope text the orchestrator's model actually sees
 * (design.md decision 4: "toModelOutput renders the envelope as text
 * (≤ 1.5k chars)"). The player-visible run — every tool call, the full
 * summary — stays in the stored tool-output part; only this truncated form
 * ever reaches a token budget.
 */
const MAX_ENVELOPE_CHARS = 1500

const TRUNCATION_MARK = "…"

/**
 * Serializes an envelope within `MAX_ENVELOPE_CHARS` without ever cutting the
 * JSON itself: only `summary`, the one free-text field that can grow, is
 * shortened, so the model always receives a complete, parseable object with
 * `agent` and `status` intact.
 *
 * Shared by every dispatch tool's `toModelOutput` — originally
 * `harness/tools/explore.ts`'s own local helper (unit 2b), moved here so
 * `harness/tools/run-tasks.ts` (unit 3) reuses the exact same truncation
 * rule instead of a second copy of it.
 */
export function renderEnvelope(envelope: SubagentEnvelope): string {
  const full = JSON.stringify(envelope)
  if (full.length <= MAX_ENVELOPE_CHARS) return full

  const overflow = full.length - MAX_ENVELOPE_CHARS + TRUNCATION_MARK.length
  const summary =
    envelope.summary.slice(0, Math.max(0, envelope.summary.length - overflow)) +
    TRUNCATION_MARK

  return JSON.stringify({ ...envelope, summary })
}
