import assert from "node:assert/strict"
import { test } from "node:test"

import { isSectionId, SECTION_LABEL_KEYS, SECTIONS } from "./sections"

test("game settings are a section of their own, linkable by ?settings=game", () => {
  assert.equal(isSectionId("game"), true)
  assert.equal(SECTION_LABEL_KEYS.game, "gameTab")
  assert.ok(SECTIONS.some((section) => section.id === "game"))
})
