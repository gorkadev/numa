import type { SystemModelMessage } from "ai"

import {
  ORCHESTRATOR_DEFAULT_SKILLS,
  skillBodies,
  skillIndex,
} from "@/lib/games/skills/registry"

import { runtimeInstructions } from "./runtime"
import { workflowInstructions } from "./workflow"

/**
 * The orchestrator's engine-reference block, built from the skills registry
 * (design.md decision 14, unit 7) rather than the deleted
 * `instructions/engine.ts`. Through unit 7b this pushed every skill, keeping
 * the prompt byte-identical to `engine.ts`'s own content; unit 8 (task 8.5)
 * cuts `ORCHESTRATOR_DEFAULT_SKILLS` down to `engine-core` alone, now that
 * size routing lives in `workflow.ts`'s own prompt instead of needing the
 * full engine reference to decide anything.
 */
const engineSkillsInstructions: SystemModelMessage = {
  role: "system",
  content: skillBodies(ORCHESTRATOR_DEFAULT_SKILLS),
}

/**
 * What the orchestrator no longer carries by default (7 of the 8 skills,
 * since unit 8's cut above): named here so its own model knows what
 * `load_skill` (unit 7b) can still load for it, rather than only knowing
 * skills exist that it cannot name — the "skill index" design.md's role
 * catalogue lists alongside the orchestrator's pushed skills.
 */
const skillIndexInstructions: SystemModelMessage = {
  role: "system",
  content: skillIndex(ORCHESTRATOR_DEFAULT_SKILLS),
}

/**
 * The system prompt, as separate blocks rather than one string.
 *
 * The AI SDK accepts an array of system messages for `instructions`, and the
 * provider concatenates them into the model's system instruction — so the
 * split costs nothing at the wire and buys a prompt that can be edited one
 * concern at a time.
 *
 * Order is the point: how a turn should go (with routing, unit 8), then the
 * environment it happens in, then what is already built inside it, then what
 * else exists to reach for. Read the other way round, the model learns an
 * API before it knows what it is for.
 */
export const gameInstructions: SystemModelMessage[] = [
  workflowInstructions,
  runtimeInstructions,
  engineSkillsInstructions,
  skillIndexInstructions,
]
