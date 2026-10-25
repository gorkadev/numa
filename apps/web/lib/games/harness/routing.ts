import type { TurnVerifyOutcome } from "./turn-state"

export type HarnessRoutingState = {
  changedGameFiles: boolean
  /** A `run_tasks` call finished this turn but no game file changed. */
  dispatchedWithoutChanges: boolean
  outcome: TurnVerifyOutcome
  verifyCalls: number
  postVerifyRunTasksCalls: number
}

/**
 * Pure phase router: verification is a host-enforced state machine, not a
 * prompt suggestion. `undefined` leaves the turn's own active tools alone.
 *
 * Two cases learned from a real run: a dispatch that wrote nothing must not
 * unlock `verify`, which would only check the untouched game and spend one of
 * the turn's two attempts; and the corrective pass after a failed `verify`
 * needs the files in view, or the orchestrator writes its fix blind.
 */
export function routeHarnessTools(
  state: HarnessRoutingState,
  available: readonly string[]
): string[] | undefined {
  if (state.outcome === "pass" || state.outcome === "refused") return []

  if (state.outcome === "fail" || state.outcome === "unavailable") {
    if (state.verifyCalls >= 2) return []
    return state.postVerifyRunTasksCalls === 0 ? ["run_tasks", "read_file", "list_files"] : ["verify"]
  }

  if (state.changedGameFiles) return ["verify"]
  if (state.dispatchedWithoutChanges) return available.filter((name) => name !== "verify")
  return undefined
}

type PriorToolResult = { toolName?: unknown }
type PriorStep = { toolResults?: unknown }

/** Whether any earlier step of this turn finished a call to `toolName`. */
export function priorStepsCalledTool(steps: unknown, toolName: string): boolean {
  if (!Array.isArray(steps)) return false

  return steps.some((step) => {
    if (typeof step !== "object" || step === null) return false
    const toolResults = (step as PriorStep).toolResults
    if (!Array.isArray(toolResults)) return false

    return toolResults.some(
      (toolResult) =>
        typeof toolResult === "object" &&
        toolResult !== null &&
        (toolResult as PriorToolResult).toolName === toolName
    )
  })
}
