import type { Slot } from "@/lib/ai/model-registry"

/**
 * Every sub-agent role the harness can dispatch. The orchestrator is not one
 * of these: it runs the `chat.agent` loop directly and never goes through
 * `run-subagent.ts`, so it has no `RoleDef` of its own (design.md's role
 * catalogue lists it only for context, with slot `strong`).
 */
export type RoleId =
  | "explorer"
  | "planner"
  | "gameplay"
  | "visuals"
  | "audio"
  | "verifier"

/**
 * A role's fixed dispatch parameters (`agent-orchestration`'s Fixed Roles Per
 * Phase requirement): a slot, never a model id or provider (decision 2), a
 * step budget and a per-role timeout. `displayName` is a stable bot identity
 * — a placeholder per design.md's role catalogue, never derived from the
 * model a run resolves to (Named Bot Identity Per Role). Tools are assembled
 * by the dispatch tool that calls `run-subagent.ts`, not declared here: a
 * role names no tool, matching "Role catalogue names no model".
 */
export type RoleDef = {
  id: RoleId
  displayName: string
  slot: Slot
  maxSteps: number
  timeoutMs: number
}

const SECOND_MS = 1000

/**
 * The role catalogue from design.md's table. Every `timeoutMs` here is the
 * role's own ceiling; `run-subagent.ts` still clamps it to whatever is left
 * of the turn's deadline, minus a 60 s buffer, whichever is smaller.
 *
 * Planner's `maxSteps` (12) is its fallback step ceiling. The actual stop
 * condition planner runs with — `hasToolCall("submit_plan")` OR this step
 * count — is unit 8's `submit_plan` dispatch code's concern, not this
 * catalogue's: a `RoleDef` names no tool.
 */
export const ROLES: Record<RoleId, RoleDef> = {
  explorer: {
    id: "explorer",
    displayName: "Scout",
    slot: "light",
    maxSteps: 8,
    timeoutMs: 120 * SECOND_MS,
  },
  planner: {
    id: "planner",
    displayName: "Architect",
    slot: "strong",
    maxSteps: 12,
    timeoutMs: 300 * SECOND_MS,
  },
  /**
   * `maxSteps`/`timeoutMs` raised from 20/600s: the planner now defaults to
   * one task owning a whole game's gameplay or visuals work
   * (`instructions/roles/planner.ts`), so the one worker that owns it needs
   * the larger budget a build used to spend across several workers. Audio
   * tasks stay small by design and keep their original budget.
   */
  gameplay: {
    id: "gameplay",
    displayName: "Builder",
    slot: "mid",
    maxSteps: 30,
    timeoutMs: 900 * SECOND_MS,
  },
  visuals: {
    id: "visuals",
    displayName: "Artist",
    slot: "mid",
    maxSteps: 30,
    timeoutMs: 900 * SECOND_MS,
  },
  audio: {
    id: "audio",
    displayName: "Composer",
    slot: "light",
    maxSteps: 20,
    timeoutMs: 600 * SECOND_MS,
  },
  verifier: {
    id: "verifier",
    displayName: "Tester",
    slot: "strong",
    maxSteps: 3,
    timeoutMs: 90 * SECOND_MS,
  },
}
