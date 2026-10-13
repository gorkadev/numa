import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

import type { LanguageModel } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import type { ModelEntry, ModelEntryId } from "./model-registry"

// Compile only this boundary and replace its runtime import. No provider code,
// credentials, or network is involved; each harness has an isolated cache.
function routingHarness() {
  const calls: { modelId: string; location: string }[] = []
  const settings: unknown[] = []
  const environment = { GOOGLE_VERTEX_LOCATION: "europe-west1" }
  const factory = (location: string) => (modelId: string) => {
    calls.push({ modelId, location })
    return new MockLanguageModelV4({ modelId, provider: "google.vertex.chat" })
  }
  const exports: { providerModel?: (entry: ModelEntry) => LanguageModel } = {}
  const source = readFileSync(new URL("./models.ts", import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  runInNewContext(compiled.outputText, {
    exports,
    require: (specifier: string) => {
      assert.equal(specifier, "@ai-sdk/google-vertex")
      return {
        googleVertex: factory(environment.GOOGLE_VERTEX_LOCATION),
        createGoogleVertex: (options: { location: string }) => {
          settings.push(options)
          return factory(options.location)
        },
      }
    },
  })
  assert.ok(exports.providerModel)
  return { providerModel: exports.providerModel, calls, settings }
}

const fixtureIds: Record<string, ModelEntryId> = {
  "gemini-4-argon/low": "argon-low",
  "gemini-4-argon/medium": "argon-medium",
  "gemini-4-argon/high": "argon-high",
  "gemini-3.8-flash/medium": "flash-medium",
  "gemini-3.8-flash/high": "flash-high",
  "gemini-3.5-flash-lite/minimal": "lite-minimal",
  "gemini-3.5-flash-lite/medium": "lite-medium",
}

function entry(model: string, effort: string): ModelEntry {
  const id = fixtureIds[`${model}/${effort}`]
  assert.ok(id, "fixture must name an existing model/effort entry")
  return {
    id,
    provider: "google-vertex",
    providerModelId: model,
    displayName: `${model} (${effort})`,
    providerOptions: { googleVertex: { thinkingConfig: { thinkingLevel: effort } } },
  }
}

test("every Argon effort selects EU without changing entry options", () => {
  const harness = routingHarness()
  for (const effort of ["low", "medium", "high"]) {
    const candidate = entry("gemini-4-argon", effort)
    const before = structuredClone(candidate)
    harness.providerModel(candidate)
    assert.deepEqual(harness.calls.at(-1), { modelId: "gemini-4-argon", location: "eu" })
    assert.deepEqual(candidate, before)
  }
  assert.equal(harness.settings.length, 1)
  assert.equal(JSON.stringify(harness.settings[0]), JSON.stringify({ location: "eu" }))
})

test("Flash and Lite retain the default europe-west1 provider", () => {
  const harness = routingHarness()
  for (const [model, efforts] of [
    ["gemini-3.8-flash", ["medium", "high"]],
    ["gemini-3.5-flash-lite", ["minimal", "medium"]],
  ] as const) {
    for (const effort of efforts) {
      harness.providerModel(entry(model, effort))
      assert.deepEqual(harness.calls.at(-1), { modelId: model, location: "europe-west1" })
    }
  }
  assert.equal(harness.settings.length, 0)
})

test("construction is lazy and cached per entry, not per provider model", () => {
  const harness = routingHarness()
  assert.equal(harness.calls.length, 0)
  assert.equal(harness.settings.length, 0)
  for (const model of ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.5-flash-lite"]) {
    const first = entry(model, "medium")
    const second = entry(model, model === "gemini-3.5-flash-lite" ? "minimal" : "high")
    const firstModel = harness.providerModel(first)
    assert.equal(harness.providerModel({ ...first }), firstModel)
    const secondModel = harness.providerModel(second)
    assert.notEqual(secondModel, firstModel)
    assert.equal(harness.providerModel(second), secondModel)
  }
  assert.equal(harness.calls.length, 6)
  assert.equal(harness.settings.length, 1)
})
