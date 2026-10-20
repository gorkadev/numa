import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveModel,
  resolveTier,
  resolveUtilityModel,
  type Slot,
} from "./model-registry"
import { type TierId } from "./model-catalog"
import { type ConcreteLanguageModel } from "./fallback-model"

export const stubProvider = () =>
  ({ specificationVersion: "v4" }) as ConcreteLanguageModel

const profiles = {
  pro: [
    ["gemini-4-argon", "high"],
    ["gemini-4-argon", "medium"],
    ["gemini-4-argon", "low"],
  ],
  balanced: [
    ["gemini-4-argon", "high"],
    ["gemini-3.8-flash", "high"],
    ["gemini-3.5-flash-lite", "medium"],
  ],
  fast: [
    ["gemini-3.8-flash", "high"],
    ["gemini-3.8-flash", "medium"],
    ["gemini-3.5-flash-lite", "medium"],
  ],
} as const
const slots: Slot[] = ["strong", "mid", "light"]

test("all nine profiles and title have explicit candidate effort and distinct IDs", () => {
  const ids = new Map<string, string>()
  for (const tier of Object.keys(profiles) as TierId[]) {
    slots.forEach((slot, index) => {
      const expected = profiles[tier][index]
      assert.ok(expected)
      const [model, effort] = expected
      const resolved = resolveModel(tier, slot, undefined, stubProvider)
      assert.deepEqual(resolved.candidates, [resolved.primary.id])
      assert.equal(resolved.primary.providerModelId, model)
      assert.deepEqual(resolved.primary.providerOptions, {
        googleVertex: {
          thinkingConfig: { thinkingLevel: effort, includeThoughts: true },
        },
      })
      const resolvedModel = resolved.model
      assert.ok(typeof resolvedModel !== "string")
      assert.equal(resolvedModel.specificationVersion, "v4")
      const key = `${model}/${effort}`
      assert.ok(
        !ids.has(resolved.primary.id) || ids.get(resolved.primary.id) === key
      )
      ids.set(resolved.primary.id, key)
      assert.ok(!resolved.primary.id.includes("3.1-pro"))
    })
  }
  const title = resolveUtilityModel("title", undefined, stubProvider).primary
  assert.equal(title.providerModelId, "gemini-3.5-flash-lite")
  assert.deepEqual(title.providerOptions, {
    googleVertex: {
      thinkingConfig: { thinkingLevel: "minimal", includeThoughts: true },
    },
  })
  assert.ok(!ids.has(title.id))
  assert.equal(ids.size, 6)
  assert.equal(resolveTier(undefined), "balanced")
})
