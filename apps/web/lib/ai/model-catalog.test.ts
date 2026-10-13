import assert from "node:assert/strict"
import test from "node:test"
import { LEGACY_MODEL_TIER, legacyModelIdSchema } from "./model-catalog"
import { readThreadTier } from "./message-model"

test("historical model metadata still resolves to the original tier", () => {
  for (const [model, tier] of Object.entries(LEGACY_MODEL_TIER)) {
    assert.equal(legacyModelIdSchema.parse(model), model)
    assert.equal(readThreadTier([{ id: "old", role: "user", parts: [], metadata: { model } }]), tier)
  }
  assert.equal(readThreadTier([]), undefined)
})
