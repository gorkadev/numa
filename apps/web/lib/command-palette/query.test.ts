import assert from "node:assert/strict"
import test from "node:test"

import { composerHref, parseQuery, quickPromptOf } from "./query"

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

test("the typed text becomes a new game's first message on the root list", () => {
  assert.equal(quickPromptOf("  snake game  ", undefined), "snake game")
  assert.equal(quickPromptOf(">snake", undefined), "snake")
})

test("there is no quick prompt for an empty search, games only, or a nested page", () => {
  assert.equal(quickPromptOf("   ", undefined), null)
  assert.equal(quickPromptOf("#snake", undefined), null)
  assert.equal(quickPromptOf("dark", "theme"), null)
})

test("opening a prompt in the composer carries it in the home URL", () => {
  assert.equal(composerHref("snake & co"), "/?prompt=snake+%26+co")
})
