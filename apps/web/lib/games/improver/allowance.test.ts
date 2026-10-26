import assert from "node:assert/strict"
import { test } from "node:test"

import { improverAllowance, improverTooltip, utcDayStart } from "./allowance"

const now = new Date("2026-10-25T15:30:00Z")
const resetsAt = "2026-10-26T00:00:00.000Z"

test("free plan cannot use the improver", () => {
  assert.deepEqual(
    improverAllowance({ plan: "free", usedToday: 0, overageBilling: true, balance: 500, now }),
    { kind: "locked" }
  )
})

test("an unknown plan is unavailable, never free and never locked", () => {
  assert.deepEqual(
    improverAllowance({ plan: "none", usedToday: 0, overageBilling: false, balance: null, now }),
    { kind: "unavailable" }
  )
})

test("pro gets 10 a day and max gets 20, counted down", () => {
  assert.deepEqual(
    improverAllowance({ plan: "pro", usedToday: 3, overageBilling: false, balance: 100, now }),
    { kind: "free", remaining: 7, limit: 10, resetsAt }
  )
  assert.deepEqual(
    improverAllowance({ plan: "max", usedToday: 0, overageBilling: false, balance: 100, now }),
    { kind: "free", remaining: 20, limit: 20, resetsAt }
  )
})

test("a spent quota without overage billing is exhausted until the next UTC day", () => {
  assert.deepEqual(
    improverAllowance({ plan: "pro", usedToday: 10, overageBilling: false, balance: 100, now }),
    { kind: "exhausted", reason: "quota", limit: 10, resetsAt }
  )
})

test("a spent quota with overage billing is charged while there is balance", () => {
  assert.deepEqual(
    improverAllowance({ plan: "max", usedToday: 25, overageBilling: true, balance: 1, now }),
    { kind: "charged", limit: 20, resetsAt }
  )
})

test("a charged improvement needs a positive, known balance", () => {
  assert.deepEqual(
    improverAllowance({ plan: "pro", usedToday: 10, overageBilling: true, balance: 0, now }),
    { kind: "exhausted", reason: "balance", limit: 10, resetsAt }
  )
  assert.deepEqual(
    improverAllowance({ plan: "pro", usedToday: 10, overageBilling: true, balance: null, now }),
    { kind: "unavailable" }
  )
})

test("the day starts at UTC midnight", () => {
  assert.equal(utcDayStart(now).toISOString(), "2026-10-25T00:00:00.000Z")
})

test("the tooltip says what the button will do in every state", () => {
  const at = resetsAt
  assert.deepEqual(improverTooltip({ kind: "free", remaining: 7, limit: 10, resetsAt: at }), {
    key: "improveRemaining",
    values: { remaining: 7, limit: 10 },
  })
  assert.deepEqual(improverTooltip({ kind: "charged", limit: 10, resetsAt: at }), {
    key: "improveCharged",
    values: { limit: 10 },
  })
  assert.deepEqual(improverTooltip({ kind: "exhausted", reason: "quota", limit: 20, resetsAt: at }), {
    key: "improveExhausted",
    values: { limit: 20 },
    resetsAt: at,
  })
  assert.deepEqual(improverTooltip({ kind: "exhausted", reason: "balance", limit: 20, resetsAt: at }), {
    key: "improveNoBalance",
    values: { limit: 20 },
    resetsAt: at,
  })
  assert.deepEqual(improverTooltip({ kind: "locked" }), { key: "improveLocked", values: {} })
  assert.deepEqual(improverTooltip({ kind: "unavailable" }), { key: "improveUnavailable", values: {} })
})
