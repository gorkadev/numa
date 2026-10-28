import type { SystemModelMessage } from "ai"

import { DIMENSION_PROFILES, type GameDimension } from "@/lib/games/dimension"
import { HARNESS_PHASES } from "@/lib/games/harness/flags"
import { skillBodies, skillIndex } from "@/lib/games/skills/registry"

import { routingInstructions, workflowInstructions } from "./workflow"
import { runtimeInstructionsFor } from "./runtime"

/**
 * The orchestrator's engine-reference block, built from the skills registry
 * (design.md decision 14, unit 7) rather than the deleted
 * `instructions/engine.ts`, for the game's dimension profile.
 *
 * Gated on `HARNESS_PHASES`, not unconditional (unit 8 correction): with the
 * flag off, every skill of the profile is pushed — for 3D, byte-identical to
 * the prompt before unit 8 cut anything. With the flag on, only the
 * profile's orchestrator defaults are pushed, and the orchestrator relies on
 * `load_skill` plus the skill index below for the rest — both of which are
 * only true statements while the flag is on: `load_skill` is not in
 * `activeTools` (`trigger/chat.ts`) when it is off, so pushing every skill
 * up front is what keeps the flag-off prompt actually usable rather than
 * merely close.
 *
 * The skill index names what the orchestrator does not carry by default, so
 * its own model knows what `load_skill` can still load for it. Omitted
 * entirely when phases are off: every skill is already pushed, and a skill
 * index pointing at an unreachable tool would be worse than no index at all.
 */
function engineSkillsInstructions(dimension: GameDimension, phases: boolean): SystemModelMessage {
  const { skills, orchestratorDefaultSkills } = DIMENSION_PROFILES[dimension]
  return { role: "system", content: skillBodies(phases ? orchestratorDefaultSkills : skills) }
}

function skillIndexInstructions(dimension: GameDimension): SystemModelMessage {
  const { skills, orchestratorDefaultSkills } = DIMENSION_PROFILES[dimension]
  return { role: "system", content: skillIndex(orchestratorDefaultSkills, skills) }
}

/**
 * The system prompt, as separate blocks rather than one string.
 *
 * The AI SDK accepts an array of system messages for `instructions`, and the
 * provider concatenates them into the model's system instruction — so the
 * split costs nothing at the wire and buys a prompt that can be edited one
 * concern at a time.
 *
 * Order is the point: how a turn should go (with routing, when phases are
 * on), then the environment it happens in, then what is already built
 * inside it, then what else exists to reach for. Read the other way round,
 * the model learns an API before it knows what it is for.
 *
 * `HARNESS_PHASES` is the single source of truth for both halves of this
 * prompt (unit 8 correction): the routing message and the skill-index
 * message are each included only when it is on, and the skills block above
 * already reads the same flag to decide how much of the engine reference to
 * push. With the flag off, this array is `[workflowInstructions,
 * runtime instructions, engine skills]` — the exact three
 * messages, in the exact order, the prompt carried before this unit existed
 * (confirmed by a sha256 comparison against `agent-harness/7b-load-skill`'s
 * own build of this array, the same method unit 7b used to prove its own
 * prompt was unchanged). With the flag on, `routingInstructions` and
 * `skillIndexInstructions` are added, matching design.md's role catalogue
 * row for the orchestrator: "workflow (+routing), runtime, pushed skills,
 * skill index".
 */
export function gameInstructionsFor(
  dimension: GameDimension,
  phases: boolean = HARNESS_PHASES
): SystemModelMessage[] {
  return [
    workflowInstructions,
    ...(phases ? [routingInstructions] : []),
    runtimeInstructionsFor(dimension),
    engineSkillsInstructions(dimension, phases),
    ...(phases ? [skillIndexInstructions(dimension)] : []),
  ]
}
