import assert from "node:assert/strict"
import test from "node:test"

import { showsMessageActions } from "./actions-visibility"

test("a player's message keeps its actions row while the turn is live", () => {
  assert.equal(
    showsMessageActions({ role: "user", live: true, hasMessage: true }),
    true
  )
})

test("an assistant reply withholds its actions until the turn has landed", () => {
  assert.equal(
    showsMessageActions({ role: "assistant", live: true, hasMessage: true }),
    false
  )
  assert.equal(
    showsMessageActions({ role: "assistant", live: false, hasMessage: true }),
    true
  )
})

test("there is no actions row without a message to act on", () => {
  assert.equal(
    showsMessageActions({ role: "user", live: false, hasMessage: false }),
    false
  )
})
