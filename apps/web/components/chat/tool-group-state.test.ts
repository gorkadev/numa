import assert from "node:assert/strict"
import test from "node:test"

import type { ToolPart } from "../../lib/games/tool-parts"
import { groupState, resolveGroupOpen, stepStatus } from "./tool-group-state"

const part = (state: string, extra = {}) =>
  ({
    type: "tool-read_file",
    toolCallId: state,
    state,
    input: { path: "game.js" },
    ...extra,
  }) as ToolPart

test("counts calls rather than files and keeps failures visible while active", () => {
  const state = groupState([
    part("output-available", { output: {} }),
    part("output-denied"),
    part("input-streaming"),
  ])
  assert.deepEqual(state, {
    count: 3,
    failed: 1,
    running: true,
    status: "running",
  })
  assert.equal(
    stepStatus(part("output-available", { output: { error: "private" } })),
    "error"
  )
  assert.equal(
    stepStatus(part("output-error", { errorText: "private" })),
    "error"
  )
  assert.equal(stepStatus(part("output-denied")), "error")
  assert.equal(stepStatus(part("input-available")), "running")
  assert.equal(stepStatus(part("output-available", { output: {} })), undefined)
  assert.equal(groupState([part("output-denied")]).status, "error")
})

test("automatic expansion follows running state until explicitly overridden", () => {
  assert.equal(resolveGroupOpen(null, true), true)
  assert.equal(resolveGroupOpen(null, false), false)
  for (const running of [true, false]) {
    assert.equal(resolveGroupOpen(false, running), false)
    assert.equal(resolveGroupOpen(true, running), true)
  }
})
