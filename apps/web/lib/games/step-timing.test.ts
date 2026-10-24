import assert from "node:assert/strict"
import test from "node:test"

import {
  addTiming,
  averageTtft,
  formatDuration,
  timingOfStep,
} from "./step-timing"

test("a step contributes its model time, tool time and first-output wait", () => {
  const timing = timingOfStep({
    responseTimeMs: 700,
    timeToFirstOutputMs: 400,
    toolExecutionMs: { a: 100, b: 250 },
  })

  assert.deepEqual(timing, { llmMs: 700, toolMs: 350, ttftMs: 400, ttftSteps: 1 })
})

test("a step with no streaming first chunk adds no first-output reading", () => {
  const timing = timingOfStep({
    responseTimeMs: 700,
    timeToFirstOutputMs: undefined,
    toolExecutionMs: {},
  })

  assert.deepEqual(timing, { llmMs: 700, toolMs: 0, ttftMs: 0, ttftSteps: 0 })
})

test("timings add field by field and the first-output average is per reading", () => {
  const total = addTiming(
    { llmMs: 700, toolMs: 350, ttftMs: 400, ttftSteps: 1 },
    { llmMs: 300, toolMs: 0, ttftMs: 200, ttftSteps: 1 }
  )

  assert.deepEqual(total, { llmMs: 1_000, toolMs: 350, ttftMs: 600, ttftSteps: 2 })
  assert.equal(averageTtft(total), 300)
})

test("no first-output readings means no average rather than zero", () => {
  assert.equal(
    averageTtft({ llmMs: 1, toolMs: 0, ttftMs: 0, ttftSteps: 0 }),
    null
  )
})

test("durations read as seconds under a minute and minutes beyond it", () => {
  assert.equal(formatDuration(0, "en"), "0s")
  assert.equal(formatDuration(1_240, "en"), "1.2s")
  assert.equal(formatDuration(59_000, "en"), "59s")
  assert.equal(formatDuration(184_000, "en"), "3m 4s")
})

test("the module never imports the server-only model registry", async () => {
  const { readFile } = await import("node:fs/promises")
  const source = await readFile(
    new URL("./step-timing.ts", import.meta.url),
    "utf8"
  )

  assert.doesNotMatch(source, /model-registry|models/)
})
