import assert from "node:assert/strict"
import test from "node:test"

import { turnEventKey } from "./turn-event-key"

test("the same turn of the same run keeps one key, so a retry still dedupes", () => {
  assert.equal(
    turnEventKey({ gameId: "g", runId: "run_a", turn: 1 }),
    turnEventKey({ gameId: "g", runId: "run_a", turn: 1 })
  )
})

test("a continuation run reusing a turn number gets a different key", () => {
  assert.notEqual(
    turnEventKey({ gameId: "g", runId: "run_a", turn: 0 }),
    turnEventKey({ gameId: "g", runId: "run_b", turn: 0 })
  )
})

test("different turns and different games never share a key", () => {
  const base = { gameId: "g", runId: "run_a", turn: 0 }

  assert.notEqual(turnEventKey(base), turnEventKey({ ...base, turn: 1 }))
  assert.notEqual(turnEventKey(base), turnEventKey({ ...base, gameId: "h" }))
})
