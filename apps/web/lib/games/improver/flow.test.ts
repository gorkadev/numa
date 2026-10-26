import assert from "node:assert/strict"
import { test } from "node:test"

import { runImprovement, type ImprovementFlow } from "./flow"

const now = new Date("2026-10-25T15:30:00Z")

type Row = { id: string; credits: number; ingested: boolean }

/**
 * An in-memory ledger behind a real mutex. Every step yields to the event
 * loop, so two calls that read the count outside the lock both see the same
 * number — the race the lock exists to close.
 */
function fakeFlow(
  overrides: Partial<ImprovementFlow<{ text: string | null }>> & {
    usedToday?: number
    overageBilling?: boolean
  } = {}
) {
  const rows: Row[] = []
  const ingested: string[] = []
  let held: Promise<void> = Promise.resolve()
  let next = 0
  const tick = () => new Promise((resolve) => setImmediate(resolve))
  for (let i = 0; i < (overrides.usedToday ?? 0); i++) {
    rows.push({ id: `old-${i}`, credits: 0, ingested: false })
  }

  const flow: ImprovementFlow<{ text: string | null }> = {
    now,
    readAccount: async () => ({
      plan: "pro",
      balance: 100,
      overageBilling: overrides.overageBilling ?? false,
    }),
    withUserLock: (fn) => {
      const run = held.then(() =>
        fn({
          countToday: async () => {
            await tick()
            return rows.length
          },
          claim: async () => {
            await tick()
            const id = `row-${next++}`
            rows.push({ id, credits: 0, ingested: false })
            return id
          },
        })
      )
      held = run.then(
        () => undefined,
        () => undefined
      )
      return run
    },
    generate: async () => {
      await tick()
      return { text: "Improved prompt" }
    },
    settle: async (claimId, _generated, charged) => {
      const credits = charged ? 7 : 0
      rows.find((row) => row.id === claimId)!.credits = credits
      return credits
    },
    release: async (claimId) => {
      rows.splice(
        rows.findIndex((row) => row.id === claimId),
        1
      )
    },
    ingest: async ({ claimId }) => {
      ingested.push(claimId)
      return true
    },
    markIngested: async (claimId) => {
      rows.find((row) => row.id === claimId)!.ingested = true
    },
    log: () => {},
    ...overrides,
  }

  return { flow, rows, ingested }
}

test("parallel calls never exceed the free quota", async () => {
  const { flow, rows } = fakeFlow({ usedToday: 9 })

  const results = await Promise.all([
    runImprovement(flow),
    runImprovement(flow),
    runImprovement(flow),
  ])

  assert.deepEqual(
    results.map((result) => (result.ok ? "ok" : result.error)),
    ["ok", "denied", "denied"]
  )
  assert.equal(rows.length, 10)
})

test("a free improvement is recorded once and never metered", async () => {
  const { flow, rows, ingested } = fakeFlow({ usedToday: 2 })

  const result = await runImprovement(flow)

  assert.equal(result.ok, true)
  assert.equal(result.ok && result.text, "Improved prompt")
  assert.equal(result.ok && result.credits, 0)
  assert.deepEqual(result.allowance, {
    kind: "free",
    remaining: 7,
    limit: 10,
    resetsAt: "2026-10-26T00:00:00.000Z",
  })
  assert.equal(rows.length, 3)
  assert.deepEqual(ingested, [])
})

test("a charged improvement is metered and marked ingested", async () => {
  const { flow, rows, ingested } = fakeFlow({ usedToday: 10, overageBilling: true })

  const result = await runImprovement(flow)

  assert.equal(result.ok && result.credits, 7)
  assert.deepEqual(ingested, ["row-0"])
  assert.deepEqual(rows.at(-1), { id: "row-0", credits: 7, ingested: true })
})

test("a failed model call gives back the claimed use", async () => {
  const { flow, rows } = fakeFlow({
    usedToday: 4,
    generate: async () => {
      throw new Error("provider down")
    },
  })

  const result = await runImprovement(flow)

  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.error, "failed")
  assert.equal(rows.length, 4)
})

test("an empty reply gives back the claimed use", async () => {
  const { flow, rows } = fakeFlow({
    usedToday: 4,
    generate: async () => ({ text: null }),
  })

  const result = await runImprovement(flow)

  assert.equal(!result.ok && result.error, "failed")
  assert.equal(rows.length, 4)
})

test("a charged improvement is not an error when marking it ingested fails", async () => {
  const { flow, rows, ingested } = fakeFlow({
    usedToday: 10,
    overageBilling: true,
    markIngested: async () => {
      throw new Error("connection reset")
    },
  })

  const result = await runImprovement(flow)

  assert.equal(result.ok, true)
  assert.equal(result.ok && result.text, "Improved prompt")
  assert.equal(result.ok && result.credits, 7)
  assert.deepEqual(ingested, ["row-0"])
  assert.equal(rows.length, 11)
})

test("a denied call claims nothing", async () => {
  const { flow, rows } = fakeFlow({ usedToday: 10 })

  const result = await runImprovement(flow)

  assert.equal(!result.ok && result.error, "denied")
  assert.equal(rows.length, 10)
})
