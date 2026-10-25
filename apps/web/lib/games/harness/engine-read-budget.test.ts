import assert from "node:assert/strict"
import { test } from "node:test"

import { engineReadBudget } from "./engine-read-budget"

test("a worker may read a couple of engine files when the index is not enough", () => {
  const guard = engineReadBudget(2)
  assert.equal(guard("engine/hud.js"), undefined)
  assert.equal(guard("./engine/controls.js"), undefined)
})

test("past the budget an engine read is refused, pointing back to the index and load_skill", () => {
  const guard = engineReadBudget(2)
  guard("engine/hud.js")
  guard("engine/controls.js")
  const refused = guard("engine/engine.js")
  assert.match(refused?.error ?? "", /Engine API index/)
  assert.match(refused?.error ?? "", /load_skill/)
})

test("the game's own files are never counted or refused", () => {
  const guard = engineReadBudget(1)
  guard("engine/hud.js")
  assert.equal(guard("game.js"), undefined)
  assert.equal(guard("index.html"), undefined)
  assert.equal(guard("engine-notes.md"), undefined)
})
