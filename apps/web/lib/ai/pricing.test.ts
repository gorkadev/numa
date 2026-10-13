import assert from "node:assert/strict"
import test from "node:test"
import type { LanguageModelUsage } from "ai"

import * as pricing from "./pricing"
import { resolveModel, resolveUtilityModel, type Slot } from "./model-registry"
import type { TierId } from "./model-catalog"
import type { ConcreteLanguageModel } from "./fallback-model"
const stubProvider = () => ({ specificationVersion: "v4" }) as ConcreteLanguageModel

function usage(input = 0, output = 0, cached = 0, reasoning = 0): LanguageModelUsage {
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    inputTokenDetails: { noCacheTokens: input - cached, cacheReadTokens: cached, cacheWriteTokens: 0 },
    outputTokenDetails: { textTokens: output - reasoning, reasoningTokens: reasoning },
  }
}
const before = new Date("2026-11-30T23:59:59.999Z")
const after = new Date("2026-12-01T00:00:00.000Z")

test("Argon UTC cutoff changes cost and stamped version, with no long-context surcharge", () => {
  const modelId = resolveModel("pro", "strong", undefined, stubProvider).primary.id
  const entry = { agentId: "orchestrator", role: "orchestrator", slot: "strong" as const,
    modelId, usage: usage(1_000_000, 1_000_000, 500_000, 600_000), status: "done" as const }
  const intro = pricing.priceTurn("pro", [entry], pricing.capturePricingSnapshot(before))
  const standard = pricing.priceTurn("pro", [entry], pricing.capturePricingSnapshot(after))
  assert.equal(intro.costMicroUsd, 11_050_000)
  assert.equal(standard.costMicroUsd, 22_100_000)
  assert.notEqual(intro.rateVersion, standard.rateVersion)
  assert.equal(intro.tokens.reasoningTokens, 600_000)
})

test("a captured snapshot stays frozen across stream and ledger calls", () => {
  const snapshot = pricing.capturePricingSnapshot(before)
  const modelId = resolveModel("balanced", "strong", undefined, stubProvider).primary.id
  const entry = { agentId: "a", role: "builder", slot: "strong" as const, modelId,
    usage: usage(100, 100), status: "done" as const }
  const stream = pricing.priceTurn("balanced", [entry], snapshot)
  before.setTime(after.getTime())
  const ledger = pricing.priceTurn("balanced", [entry], snapshot)
  assert.deepEqual(ledger, stream)
  assert.equal(ledger.costMicroUsd, 1200)
  assert.equal(snapshot.rateVersion, ledger.rateVersion)
})

test("all active IDs are priced; efforts share rates; zero and utility usage are safe", () => {
  const snapshot = pricing.capturePricingSnapshot(new Date("2026-10-13T00:00:00Z"))
  const perModel = new Map<string, number>()
  for (const tier of ["pro", "balanced", "fast"] as TierId[]) {
    for (const slot of ["strong", "mid", "light"] as Slot[]) {
      const entry = resolveModel(tier, slot, undefined, stubProvider).primary
      const cost = pricing.turnCostMicroUsd({ modelId: entry.id, usage: usage(100, 100), snapshot })
      assert.ok(cost > 0)
      const prior = perModel.get(entry.providerModelId)
      if (prior !== undefined) assert.equal(cost, prior)
      perModel.set(entry.providerModelId, cost)
    }
  }
  assert.equal(pricing.priceTurn("balanced", [], snapshot).credits, 0)
  const modelId = resolveUtilityModel("title", undefined, stubProvider).primary.id
  assert.equal(pricing.turnCostMicroUsd({ modelId, usage: usage(), snapshot }), 0)
  assert.equal(pricing.turnCostMicroUsd({ modelId, usage: usage(100, 100, 50, 80), snapshot }), 267)
  assert.equal(pricing.turnCostMicroUsd({ modelId, usage: usage(10, 0, 20), snapshot }), 1)
})
