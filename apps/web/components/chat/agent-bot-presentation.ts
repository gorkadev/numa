import { happy, idle, sad, sleepy, thinking, unsure } from "blobatar/expression"
import type { SubagentRoleId, SubagentRunStatus } from "../../lib/games/harness/records"

// Gen2 bands verified in blobatar/src/styles/blob.ts (not uniform indices).
const identities = {
  explorer: { hue: 174, shape: 0.35 }, // Scout: organic (.22–.48)
  planner: { hue: 270, shape: 0.93 }, // Architect: hexagon (.915–.95)
  gameplay: { hue: 215, shape: 0.54 }, // Builder: boxy (.48–.60)
  visuals: { hue: 12, shape: 0.965 }, // Artist: sun (.95–.98)
  audio: { hue: 40, shape: 0.89 }, // Composer: droplet (.86–.915)
  verifier: { hue: 140, shape: 0.65 }, // Tester: capsule (.60–.70)
} satisfies Record<SubagentRoleId, { hue: number; shape: number }>

const expressions = {
  running: thinking,
  done: happy,
  partial: unsure,
  blocked: unsure,
  error: sad,
  aborted: idle,
  skipped: idle,
  unavailable: sleepy,
} satisfies Record<SubagentRunStatus, typeof idle>

/** Role owns identity; status only changes the pose and motion policy. */
export function agentBotPresentation(role: SubagentRoleId, status: SubagentRunStatus) {
  const { hue, shape } = identities[role]
  return {
    name: `numa-agent-${role}`,
    hue,
    tone: 0.4,
    traits: { shape },
    expression: expressions[status],
    animate: status === "running" ? "always" as const : "hover" as const,
  }
}
