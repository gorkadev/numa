import assert from "node:assert/strict"
import test from "node:test"
import type { UIMessage } from "ai"

import {
  latestContextUsage,
  sumSessionActivity,
  sumSessionSpeed,
  sumSessionTiming,
  sumSessionUsage,
} from "./session-usage"

function reply(
  tokens?: {
    input: number
    output: number
    cached: number
    reasoning: number
  },
  credits?: number
): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [],
    metadata: { ...(tokens ? { tokens } : {}), ...(credits !== undefined ? { credits } : {}) },
  }
}

test("a thread with no priced turn reports nothing to show", () => {
  const user: UIMessage = { id: "u", role: "user", parts: [] }

  assert.equal(sumSessionUsage([]), null)
  assert.equal(sumSessionUsage([user, reply()]), null)
})

test("sums input, output and cached across every priced reply", () => {
  const usage = sumSessionUsage([
    reply({ input: 30_000, output: 200, cached: 10_000, reasoning: 50 }),
    reply({ input: 10_413, output: 13, cached: 0, reasoning: 0 }),
  ])

  assert.deepEqual(usage, {
    total: 40_626,
    input: 40_413,
    cached: 10_000,
    uncached: 30_413,
    output: 213,
    reasoning: 50,
    cacheHit: 10_000 / 40_413,
    credits: undefined,
  })
})

test("sums the credits every reply was charged, and reports none when no reply carries any", () => {
  const charged = sumSessionUsage([
    reply({ input: 100, output: 10, cached: 0, reasoning: 0 }, 3),
    reply({ input: 100, output: 10, cached: 0, reasoning: 0 }, 4),
  ])
  const unpriced = sumSessionUsage([
    reply({ input: 100, output: 10, cached: 0, reasoning: 0 }),
  ])

  assert.equal(charged?.credits, 7)
  assert.equal(unpriced?.credits, undefined)
})

test("cached is a subset of input: the total never counts it twice", () => {
  const usage = sumSessionUsage([
    reply({ input: 1_000, output: 100, cached: 1_000, reasoning: 0 }),
  ])

  assert.equal(usage?.total, 1_100)
  assert.equal(usage?.uncached, 0)
  assert.equal(usage?.cacheHit, 1)
})

test("ignores user messages and replies that predate token metadata", () => {
  const user: UIMessage = {
    id: "u",
    role: "user",
    parts: [],
    metadata: { tokens: { input: 999, output: 999, cached: 0, reasoning: 0 } },
  }

  const usage = sumSessionUsage([
    user,
    reply(),
    reply({ input: 100, output: 20, cached: 0, reasoning: 0 }),
  ])

  assert.equal(usage?.total, 120)
})

test("a session with zero input reports a cache hit of zero, not NaN", () => {
  const usage = sumSessionUsage([
    reply({ input: 0, output: 0, cached: 0, reasoning: 0 }),
  ])

  assert.equal(usage?.cacheHit, 0)
})

test("the latest context reading is the newest reply that carries one", () => {
  const withContext = (tokens: number): UIMessage => ({
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [],
    metadata: { context: { tokens, window: 1_000 } },
  })

  assert.equal(latestContextUsage([]), null)
  assert.equal(latestContextUsage([reply()]), null)
  assert.deepEqual(
    latestContextUsage([withContext(10), withContext(40), reply()]),
    { tokens: 40, window: 1_000 }
  )
})

test("session speed sums tokens and time over the replies that carry one", () => {
  const withSpeed = (tokens: number, ms: number): UIMessage => ({
    ...reply(),
    metadata: { speed: { tokens, ms } },
  })

  assert.equal(sumSessionSpeed([]), null)
  assert.equal(sumSessionSpeed([reply()]), null)
  assert.deepEqual(
    sumSessionSpeed([withSpeed(100, 1_000), reply(), withSpeed(300, 1_000)]),
    { tokens: 400, ms: 2_000 }
  )
})

test("session activity counts replies with a receipt and sums their steps", () => {
  const priced = (steps?: number): UIMessage => ({
    ...reply({ input: 1, output: 1, cached: 0, reasoning: 0 }),
    metadata: {
      tokens: { input: 1, output: 1, cached: 0, reasoning: 0 },
      ...(steps === undefined ? {} : { steps }),
    },
  })
  const user: UIMessage = { id: "u", role: "user", parts: [] }

  assert.deepEqual(sumSessionActivity([]), { turns: 0, steps: 0 })
  assert.deepEqual(sumSessionActivity([user, reply()]), { turns: 0, steps: 0 })
  assert.deepEqual(sumSessionActivity([user, priced(3), user, priced(2), priced()]), {
    turns: 3,
    steps: 5,
  })
})

test("session timing sums every reply's timing and is null without any", () => {
  const withTiming = (llmMs: number, ttftMs: number): UIMessage => ({
    ...reply(),
    metadata: { timing: { llmMs, toolMs: 10, ttftMs, ttftSteps: 1 } },
  })

  assert.equal(sumSessionTiming([reply()]), null)
  assert.deepEqual(sumSessionTiming([withTiming(700, 400), reply(), withTiming(300, 200)]), {
    llmMs: 1_000,
    toolMs: 20,
    ttftMs: 600,
    ttftSteps: 2,
  })
})
