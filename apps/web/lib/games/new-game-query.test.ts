import assert from "node:assert/strict"
import { test } from "node:test"

import { initialTierId, newGameSearch } from "./new-game-query"

test("the URL's tier wins, then the player's default, then the app's", () => {
  assert.equal(initialTierId("fast", "pro"), "fast")
  assert.equal(initialTierId(null, "pro"), "pro")
  assert.equal(initialTierId("turbo", "pro"), "pro")
  assert.equal(initialTierId(null, null), "balanced")
})

test("a picked tier or template is written into the query, keeping the rest", () => {
  assert.equal(newGameSearch("", { tier: "pro" }), "?tier=pro")
  assert.equal(
    newGameSearch("?template=toon-shooter&settings=game", { tier: "fast" }),
    "?template=toon-shooter&settings=game&tier=fast"
  )
  assert.equal(
    newGameSearch("?tier=pro", { template: "toon-shooter" }),
    "?tier=pro&template=toon-shooter"
  )
  assert.equal(
    newGameSearch("?tier=pro&template=toon-shooter", { template: "none" }),
    "?tier=pro&template=none"
  )
})

test("the composer's old ?prompt= hand-off is dropped when the query is rewritten", () => {
  assert.equal(newGameSearch("?prompt=hola&tier=pro", { tier: "fast" }), "?tier=fast")
})
