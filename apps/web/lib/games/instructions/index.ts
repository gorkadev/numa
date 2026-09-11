import type { SystemModelMessage } from "ai"

import { ORCHESTRATOR_DEFAULT_SKILLS, skillBodies } from "@/lib/games/skills/registry"

import { runtimeInstructions } from "./runtime"
import { workflowInstructions } from "./workflow"

/**
 * The orchestrator's engine-reference block, built from the skills registry
 * (design.md decision 14, unit 7) rather than the deleted
 * `instructions/engine.ts`. Until unit 8 cuts the orchestrator's own skills
 * down to `engine-core` alone (task 8.5, once routing moves into
 * `workflow.ts`), it keeps every skill pushed
 * (`ORCHESTRATOR_DEFAULT_SKILLS` is `ALL_SKILL_NAMES`), so the prompt this
 * block produces is identical to `engine.ts`'s own content: unit 7a's
 * lossless-move verification confirmed that joining the 8 skills' bodies,
 * in this exact order, with a single blank line between each, reconstructs
 * that original document byte-for-byte.
 */
const engineSkillsInstructions: SystemModelMessage = {
  role: "system",
  content: skillBodies(ORCHESTRATOR_DEFAULT_SKILLS),
}

/**
 * The system prompt, as separate blocks rather than one string.
 *
 * The AI SDK accepts an array of system messages for `instructions`, and the
 * provider concatenates them into the model's system instruction — so the
 * split costs nothing at the wire and buys a prompt that can be edited one
 * concern at a time.
 *
 * Order is the point: how a turn should go, then the environment it happens
 * in, then what is already built inside it. Read the other way round, the
 * model learns an API before it knows what it is for.
 */
export const gameInstructions: SystemModelMessage[] = [
  workflowInstructions,
  runtimeInstructions,
  engineSkillsInstructions,
]
