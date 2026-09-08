import type { SystemModelMessage } from "ai"

import { runtimeInstructions } from "./runtime"
import { workflowInstructions } from "./workflow"

/**
 * The system prompt, as separate blocks rather than one string.
 *
 * The AI SDK accepts an array of system messages for `instructions`, and the
 * provider concatenates them into the model's system instruction — so the
 * split costs nothing at the wire and buys a prompt that can be edited one
 * concern at a time.
 *
 * Order is the point: how a turn should go, then the environment it happens
 * in. Read the other way round, the model learns about a directory before it
 * knows what it is for.
 */
export const gameInstructions: SystemModelMessage[] = [
  workflowInstructions,
  runtimeInstructions,
]
