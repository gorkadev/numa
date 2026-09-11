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
