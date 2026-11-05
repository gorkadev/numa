import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  findTextSpan,
  pendingMessageJump,
  requestMessageJump,
  runIdContaining,
  settleMessageJump,
  subscribeMessageJump,
} from "./message-jump.ts"

describe("message jump requests", () => {
  const jump = { gameId: "g1", position: 4, messageId: "m4", query: "snake" }

  it("is pending only for its own game until settled", () => {
    requestMessageJump(jump)

    assert.equal(pendingMessageJump("g1"), jump)
    assert.equal(pendingMessageJump("g2"), null)

    settleMessageJump(jump)
    assert.equal(pendingMessageJump("g1"), null)
  })

  it("keeps a newer request when an older one settles", () => {
    const newer = { ...jump, position: 9, messageId: "m9" }
    requestMessageJump(jump)
    requestMessageJump(newer)

    settleMessageJump(jump)
    assert.equal(pendingMessageJump("g1"), newer)

    settleMessageJump(newer)
  })

  it("notifies subscribers on request and settle", () => {
    let calls = 0
    const unsubscribe = subscribeMessageJump(() => calls++)

    requestMessageJump(jump)
    settleMessageJump(jump)
    unsubscribe()
    requestMessageJump(jump)
    settleMessageJump(jump)

    assert.equal(calls, 2)
  })
})

describe("runIdContaining", () => {
  const runs = [
    { id: "u1", messages: [{ id: "u1" }] },
    { id: "a1", messages: [{ id: "a1" }, { id: "a2" }] },
  ]

  it("finds the row of a message past the first of its run", () => {
    assert.equal(runIdContaining(runs, "a2"), "a1")
    assert.equal(runIdContaining(runs, "u1"), "u1")
  })

  it("is null for a message not loaded", () => {
    assert.equal(runIdContaining(runs, "x"), null)
  })
})

describe("findTextSpan", () => {
  it("matches within one node, case aside", () => {
    assert.deepEqual(findTextSpan(["Make a Snake game"], "snake"), {
      start: { node: 0, offset: 7 },
      end: { node: 0, offset: 12 },
    })
  })

  it("matches across nodes split by inline markup", () => {
    assert.deepEqual(findTextSpan(["a ", "sna", "ke b"], "snake"), {
      start: { node: 1, offset: 0 },
      end: { node: 2, offset: 2 },
    })
  })

  it("never starts or ends on an empty node edge", () => {
    assert.deepEqual(findTextSpan(["ab", "cd", "ef"], "cd"), {
      start: { node: 1, offset: 0 },
      end: { node: 1, offset: 2 },
    })
  })

  it("is null without a match or a query", () => {
    assert.equal(findTextSpan(["abc"], "x"), null)
    assert.equal(findTextSpan(["abc"], ""), null)
  })
})
