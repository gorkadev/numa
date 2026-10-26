import assert from "node:assert/strict"
import { test } from "node:test"

import { replayUnbilled, type UnbilledLedger } from "./replay"

const turn = {
  id: "turn-1",
  userId: "user-1",
  gameId: "game-1",
  runId: "run-1",
  turn: 3,
  credits: 12,
  modelId: "argon-high",
}
const improvement = {
  id: "imp-1",
  userId: "user-2",
  credits: 2,
  modelId: "lite-medium",
}

function fakeLedger(overrides: Partial<UnbilledLedger> = {}) {
  const calls: string[] = []
  const ledger: UnbilledLedger = {
    pendingTurns: async () => [turn],
    pendingImprovements: async () => [improvement],
    ingestTurn: async (row) => {
      calls.push(`ingest turn ${row.gameId}:${row.runId}:${row.turn} ${row.credits}`)
      return true
    },
    ingestImprovement: async (row) => {
      calls.push(`ingest improvement ${row.improvementId} ${row.credits}`)
      return true
    },
    markTurn: async (id) => {
      calls.push(`mark turn ${id}`)
    },
    markImprovement: async (id) => {
      calls.push(`mark improvement ${id}`)
    },
    releaseStaleClaims: async () => {
      calls.push("release stale claims")
      return 2
    },
    ...overrides,
  }

  return { ledger, calls }
}

test("resends unbilled turns and improvements under their original keys", async () => {
  const { ledger, calls } = fakeLedger()

  const result = await replayUnbilled(ledger)

  assert.deepEqual(calls, [
    "ingest turn game-1:run-1:3 12",
    "mark turn turn-1",
    "ingest improvement imp-1 2",
    "mark improvement imp-1",
    "release stale claims",
  ])
  assert.deepEqual(result, { resent: 2, failed: 0, released: 2 })
})

test("a row Polar refuses stays unbilled and the rest still go", async () => {
  const { ledger, calls } = fakeLedger({
    ingestTurn: async () => false,
  })

  const result = await replayUnbilled(ledger)

  assert.deepEqual(calls, [
    "ingest improvement imp-1 2",
    "mark improvement imp-1",
    "release stale claims",
  ])
  assert.deepEqual(result, { resent: 1, failed: 1, released: 2 })
})

test("a failure on one row never stops the replay", async () => {
  const { ledger, calls } = fakeLedger({
    ingestTurn: async () => {
      throw new Error("network")
    },
    markImprovement: async () => {
      throw new Error("connection reset")
    },
  })

  const result = await replayUnbilled(ledger)

  assert.deepEqual(calls, ["ingest improvement imp-1 2", "release stale claims"])
  assert.deepEqual(result, { resent: 1, failed: 1, released: 2 })
})

test("a failed cleanup of stale claims never stops the replay", async () => {
  const { ledger, calls } = fakeLedger({
    releaseStaleClaims: async () => {
      throw new Error("connection reset")
    },
  })

  const result = await replayUnbilled(ledger)

  assert.equal(calls.length, 4)
  assert.deepEqual(result, { resent: 2, failed: 0, released: 0 })
})
