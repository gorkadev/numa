import assert from "node:assert/strict"
import test from "node:test"

import { addSpeed, speedOfStep, tokensPerSecond } from "./generation-speed"

test("a step's speed is its output over the time after the first output chunk", () => {
  const speed = speedOfStep(200, {
    responseTimeMs: 708,
    timeToFirstOutputMs: 404,
  })

  assert.deepEqual(speed, { tokens: 200, ms: 304 })
  assert.equal(Math.round(tokensPerSecond(speed!)), 658)
})

test("a step with nothing to measure yields no reading", () => {
  const timing = { responseTimeMs: 700, timeToFirstOutputMs: 400 }

  assert.equal(speedOfStep(0, timing), null)
  assert.equal(speedOfStep(undefined, timing), null)
  assert.equal(
    speedOfStep(10, { responseTimeMs: 700, timeToFirstOutputMs: undefined }),
    null
  )
  assert.equal(
    speedOfStep(10, { responseTimeMs: 400, timeToFirstOutputMs: 400 }),
    null
  )
})

test("speeds add tokens and time, so the rate is weighted by time", () => {
  const total = addSpeed({ tokens: 100, ms: 1_000 }, { tokens: 300, ms: 1_000 })

  assert.deepEqual(total, { tokens: 400, ms: 2_000 })
  assert.equal(tokensPerSecond(total), 200)
})

test("no time means no rate rather than a division by zero", () => {
  assert.equal(tokensPerSecond({ tokens: 0, ms: 0 }), 0)
})

test("the module never imports the server-only model registry", async () => {
  const { readFile } = await import("node:fs/promises")
  const source = await readFile(
    new URL("./generation-speed.ts", import.meta.url),
    "utf8"
  )

  assert.doesNotMatch(source, /model-registry|models/)
})
