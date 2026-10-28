import assert from "node:assert/strict"
import { test } from "node:test"

import { toggleActionsFor } from "./setting-actions"

const settings = {
  improverOverageBilling: false,
  defaultTierId: null,
  showSessionStats: true,
  wrapCodeBlocks: false,
}

test("a toggle offers the opposite of its saved value", () => {
  assert.deepEqual(
    toggleActionsFor(["session-stats", "wrap-code"], settings),
    [
      { id: "session-stats", key: "showSessionStats", next: false },
      { id: "wrap-code", key: "wrapCodeBlocks", next: true },
    ]
  )
})

test("settings without a toggle action and unknown saved values offer nothing", () => {
  assert.deepEqual(toggleActionsFor(["sign-out", "credits"], settings), [])
  assert.deepEqual(toggleActionsFor(["wrap-code"], null), [])
})

test("charges are never toggled from the palette", () => {
  assert.deepEqual(toggleActionsFor(["improver-overage"], settings), [])
})
