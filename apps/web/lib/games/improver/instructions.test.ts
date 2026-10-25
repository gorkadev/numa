import assert from "node:assert/strict"
import { test } from "node:test"

import { improverInstructions, improverTemplateContext } from "./instructions"

const toon = {
  label: "Toon Shooter",
  tagline: "Start with a complete cartoon 3D shooter kit.",
  models: [
    {
      id: "character-soldier",
      path: "assets/toon-shooter/Characters/Character_Soldier.gltf",
      category: "character",
      animations: [{ name: "Run_Shoot", category: "locomotion" }],
    },
    { id: "crate", path: "assets/toon-shooter/Environment/Crate.gltf", category: "environment" },
  ],
}

test("a new-game improvement keeps the player's language and scope", () => {
  const text = improverInstructions("new")
  assert.match(text, /same language/i)
  assert.match(text, /do not add/i)
  assert.match(text, /controls/i)
})

test("a change improvement rewrites a change request, not a new game", () => {
  const text = improverInstructions("change")
  assert.match(text, /change request/i)
  assert.doesNotMatch(text, /win or lose/i)
})

test("the template context names its models and animations without file paths", () => {
  const context = improverTemplateContext(toon)
  assert.match(context, /Toon Shooter/)
  assert.match(context, /character-soldier \(animations: Run_Shoot\)/)
  assert.match(context, /crate/)
  assert.doesNotMatch(context, /\.gltf|assets\//)
})

test("no template means no template context", () => {
  assert.equal(improverTemplateContext(undefined), "")
})
