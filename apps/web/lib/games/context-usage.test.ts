import assert from "node:assert/strict"
import test from "node:test"

import {
  contextUsageChunk,
  contextUsageOf,
  readContextUsage,
} from "./context-usage"

test("the chunk is transient so a reload never replays a stale ring", () => {
  const chunk = contextUsageChunk({ tokens: 16_700, window: 1_048_576 })

  assert.deepEqual(chunk, {
    type: "data-context-usage",
    data: { tokens: 16_700, window: 1_048_576 },
    transient: true,
  })
})

test("reads back what the chunk carried and nothing else", () => {
  assert.deepEqual(
    readContextUsage({
      type: "data-context-usage",
      data: { tokens: 10, window: 100 },
    }),
    { tokens: 10, window: 100 }
  )
  assert.equal(readContextUsage({ type: "data-turn-credits", data: {} }), null)
  assert.equal(
    readContextUsage({ type: "data-context-usage", data: { tokens: "10" } }),
    null
  )
  assert.equal(
    readContextUsage({
      type: "data-context-usage",
      data: { tokens: 10, window: 0 },
    }),
    null
  )
  assert.equal(readContextUsage({ type: "data-context-usage" }), null)
})

test("a step with no reported input leaves the previous reading alone", () => {
  assert.equal(contextUsageOf(undefined, "argon-high"), null)
  assert.equal(contextUsageOf(0, "argon-high"), null)
})

test("the window comes from the entry that served the step", () => {
  assert.deepEqual(contextUsageOf(16_700, "flash-high"), {
    tokens: 16_700,
    window: 1_048_576,
  })
})
