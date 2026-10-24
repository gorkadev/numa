import assert from "node:assert/strict"
import test from "node:test"

import { parseQuery } from "./query"

test("> narrows the palette to commands and is left out of the search", () => {
  assert.deepEqual(parseQuery(">theme"), { scope: "commands", text: "theme" })
  assert.deepEqual(parseQuery("> theme"), { scope: "commands", text: "theme" })
})

test("# narrows the palette to games and is left out of the search", () => {
  assert.deepEqual(parseQuery("#snake"), { scope: "games", text: "snake" })
  assert.deepEqual(parseQuery("#"), { scope: "games", text: "" })
})

test("without a prefix the palette searches everything", () => {
  assert.deepEqual(parseQuery("snake"), { scope: "all", text: "snake" })
  assert.deepEqual(parseQuery("a > b"), { scope: "all", text: "a > b" })
})
