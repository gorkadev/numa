import assert from "node:assert/strict"
import { test } from "node:test"

import { priorStepsCalledTool, routeHarnessTools, type HarnessRoutingState } from "./routing"

const AVAILABLE = ["read_file", "list_files", "write_file", "explore", "plan", "run_tasks", "verify", "load_skill"]

const fresh: HarnessRoutingState = {
  changedGameFiles: false,
  dispatchedWithoutChanges: false,
  outcome: "not-run",
  verifyCalls: 0,
  postVerifyRunTasksCalls: 0,
}

test("a turn that has not dispatched or changed anything keeps every tool", () => {
  assert.equal(routeHarnessTools(fresh, AVAILABLE), undefined)
})

test("once a game file changed, the turn must verify", () => {
  assert.deepEqual(routeHarnessTools({ ...fresh, changedGameFiles: true }, AVAILABLE), ["verify"])
})

test("a dispatch that changed nothing does not unlock verify on the untouched game", () => {
  const tools = routeHarnessTools({ ...fresh, dispatchedWithoutChanges: true }, AVAILABLE)

  assert.ok(tools)
  assert.ok(!tools.includes("verify"))
  assert.deepEqual(tools, AVAILABLE.filter((name) => name !== "verify"))
})

test("after a failed verify the orchestrator can read files before its corrective pass", () => {
  assert.deepEqual(
    routeHarnessTools({ ...fresh, changedGameFiles: true, outcome: "fail", verifyCalls: 1 }, AVAILABLE),
    ["run_tasks", "read_file", "list_files"]
  )
})

test("after the corrective pass only verify is left, and two verifies end the turn", () => {
  const failed = { ...fresh, changedGameFiles: true, outcome: "fail" as const, verifyCalls: 1 }

  assert.deepEqual(routeHarnessTools({ ...failed, postVerifyRunTasksCalls: 1 }, AVAILABLE), ["verify"])
  assert.deepEqual(routeHarnessTools({ ...failed, verifyCalls: 2 }, AVAILABLE), [])
})

test("a passed or refused verify ends the turn", () => {
  assert.deepEqual(routeHarnessTools({ ...fresh, outcome: "pass" }, AVAILABLE), [])
  assert.deepEqual(routeHarnessTools({ ...fresh, outcome: "refused" }, AVAILABLE), [])
})

test("prior steps are searched for a finished call to the named tool", () => {
  const steps = [{ toolResults: [{ toolName: "read_file", output: {} }] }, { toolResults: [{ toolName: "run_tasks", output: { outcomes: [] } }] }]

  assert.equal(priorStepsCalledTool(steps, "run_tasks"), true)
  assert.equal(priorStepsCalledTool(steps, "plan"), false)
  assert.equal(priorStepsCalledTool(undefined, "run_tasks"), false)
})
