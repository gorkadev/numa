import assert from "node:assert/strict"
import test from "node:test"

import { escapeLike, matchSnippet } from "./message-search"

test("LIKE wildcards in the query are matched literally", () => {
  assert.equal(escapeLike("100%_done\\"), "100\\%\\_done\\\\")
})

test("the snippet is the match with a little context, case-insensitively", () => {
  const text = "Make the snake faster when it eats an apple, then add a score"
  assert.equal(matchSnippet(text, "EATS", 10), "…r when it eats an apple,…")
})

test("a match near either end needs no ellipsis on that side", () => {
  assert.equal(matchSnippet("snake game", "snake", 10), "snake game")
})

test("whitespace in the stored text collapses to single spaces", () => {
  assert.equal(matchSnippet("a\n\n  snake", "snake", 10), "a snake")
})

test("no match gives no snippet", () => {
  assert.equal(matchSnippet("snake game", "tetris", 10), null)
})
