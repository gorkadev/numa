import assert from "node:assert/strict"
import test from "node:test"

import {
  contextUsageChunk,
  contextUsageOf,
  readContextUsage,
} from "./context-usage"

test("the chunk is transient so a reload never replays a stale ring", () => {
  const chunk = contextUsageChunk({
    tokens: 16_700,
    window: 1_048_576,
    cached: 9_000,
  })

  assert.deepEqual(chunk, {
    type: "data-context-usage",
    data: { tokens: 16_700, window: 1_048_576, cached: 9_000 },
    transient: true,
  })
})

test("reads back what the chunk carried and nothing else", () => {
  assert.deepEqual(
    readContextUsage({
      type: "data-context-usage",
      data: { tokens: 10, window: 100, cached: 4 },
    }),
    { tokens: 10, window: 100, cached: 4 }
  )
  // A reading written before `cached` existed still reads.
  assert.deepEqual(
    readContextUsage({
      type: "data-context-usage",
      data: { tokens: 10, window: 100 },
    }),
    { tokens: 10, window: 100 }
  )
  assert.equal(
    readContextUsage({
      type: "data-context-usage",
      data: { tokens: 10, window: 100, cached: "4" },
    }),
    null
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
  assert.equal(contextUsageOf(undefined, 1_048_576), null)
  assert.equal(contextUsageOf(0, 1_048_576), null)
})

test("pairs the step's input with the window it was measured against", () => {
  assert.deepEqual(contextUsageOf(16_700, 1_048_576, 9_000), {
    tokens: 16_700,
    window: 1_048_576,
    cached: 9_000,
  })
  assert.equal(contextUsageOf(16_700, 1_048_576)?.cached, 0)
})

test("this module stays importable from the browser", async () => {
  const { readFile } = await import("node:fs/promises")
  const source = await readFile(
    new URL("./context-usage.ts", import.meta.url),
    "utf8"
  )

  // The registry pulls in the Vertex provider (google-auth-library), which
  // cannot be bundled for the client; the browser imports this file.
  assert.doesNotMatch(source, /model-registry/)
})
