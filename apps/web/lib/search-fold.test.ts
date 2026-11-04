import assert from "node:assert/strict"
import test from "node:test"

import { containsPattern, foldText } from "./search-fold"

test("text folds to lowercase without accents", () => {
  assert.equal(foldText("Diseño FINAL.png"), "diseno final.png")
  assert.equal(foldText("Ça va, Dragón"), "ca va, dragon")
})

test("a search becomes a contains pattern on folded text, with wildcards escaped", () => {
  assert.equal(containsPattern("  Diseño "), "%diseno%")
  assert.equal(containsPattern("100%_done\\"), "%100\\%\\_done\\\\%")
  assert.equal(containsPattern("   "), null)
})
