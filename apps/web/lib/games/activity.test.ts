import assert from "node:assert/strict"
import test from "node:test"

import { isGameUnread } from "./activity"

const earlier = new Date("2026-10-24T10:00:00Z")
const later = new Date("2026-10-24T10:05:00Z")

test("a game whose agent never finished a turn has nothing to read", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: null, lastReadAt: null }), false)
  assert.equal(isGameUnread({ lastTurnFinishedAt: null, lastReadAt: later }), false)
})

test("a finished turn the player never opened is unread", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: earlier, lastReadAt: null }), true)
})

test("a turn that finished after the last read is unread", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: later, lastReadAt: earlier }), true)
})

test("a read at or after the finished turn clears it", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: earlier, lastReadAt: later }), false)
  assert.equal(isGameUnread({ lastTurnFinishedAt: earlier, lastReadAt: earlier }), false)
})
