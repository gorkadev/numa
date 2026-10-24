import assert from "node:assert/strict"
import test from "node:test"

import { backFrom } from "./pages"

test("backspace on an empty search leaves the nested page for the one under it", () => {
  assert.deepEqual(backFrom(["templates"], ""), [])
  assert.deepEqual(backFrom(["theme", "language"], ""), ["theme"])
})

test("backspace with text in the search only edits the text", () => {
  assert.equal(backFrom(["theme"], "da"), null)
})

test("backspace on the root page does nothing", () => {
  assert.equal(backFrom([], ""), null)
})
