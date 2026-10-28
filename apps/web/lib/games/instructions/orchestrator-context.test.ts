import assert from "node:assert/strict"
import { test } from "node:test"

import { orchestratorContextInstructions } from "./orchestrator-context"

const text = (messages: { content: string }[]) => messages.map((message) => message.content).join("\n")

test("the orchestrator gets the engine API index, so tasks can name real engine calls", () => {
  const prompt = text(orchestratorContextInstructions({ dimension: "3d", templateContext: "## Starter template\nNone.", requiresAssetReceipt: false, modelIds: [] }))
  assert.match(prompt, /createGame/)
})

test("the orchestrator gets the game's template context", () => {
  const prompt = text(orchestratorContextInstructions({ dimension: "3d", templateContext: "## Starter template\nToon Shooter.", requiresAssetReceipt: false, modelIds: [] }))
  assert.match(prompt, /Toon Shooter\./)
})

test("a fresh template build is told to declare its eager assets, with the ids it may use", () => {
  const prompt = text(orchestratorContextInstructions({ dimension: "3d", templateContext: "T", requiresAssetReceipt: true, modelIds: ["character-soldier", "crate"] }))
  assert.match(prompt, /assetReceipt/)
  assert.match(prompt, /character-soldier, crate/)
})

test("any other build is not asked for a receipt", () => {
  const prompt = text(orchestratorContextInstructions({ dimension: "3d", templateContext: "T", requiresAssetReceipt: false, modelIds: ["crate"] }))
  assert.doesNotMatch(prompt, /assetReceipt/)
})

test("a 2D game's orchestrator gets the 2D engine API index", () => {
  const prompt = text(orchestratorContextInstructions({ dimension: "2d", templateContext: "T", requiresAssetReceipt: false, modelIds: [] }))
  assert.match(prompt, /createSprite/)
  assert.doesNotMatch(prompt, /addLighting/)
})
