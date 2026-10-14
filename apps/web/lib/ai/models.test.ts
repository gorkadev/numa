import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
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
  const settings: { location: string; project?: string; apiKey?: string }[] = []
  const environment = {
    GOOGLE_VERTEX_LOCATION: "europe-west1",
    GOOGLE_VERTEX_PROJECT: "synthetic-project",
  }
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
    process: { env: environment },
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
  assert.equal(JSON.stringify(harness.settings[0]), JSON.stringify({ location: "eu", apiKey: "", project: "synthetic-project" }))
})

// Exercise the installed SDK with a synthetic environment and GoogleAuth.
// Neither real process.env nor local credentials are read or changed.
test("installed SDK forwards the factory project to both the EU URL and GoogleAuth", async () => {
  const vertexEntry = import.meta.resolve("@ai-sdk/google-vertex")
  const require = createRequire(vertexEntry)
  const sdkRoot = new URL("../src/", vertexEntry)
  const environment: Record<string, string> = {
    GOOGLE_VERTEX_API_KEY: "synthetic-express-key",
    GOOGLE_VERTEX_PROJECT: "synthetic-project",
    GOOGLE_VERTEX_LOCATION: "europe-west1",
  }
  const utils = require("@ai-sdk/provider-utils")
  let authCalls = 0
  function compileSdk(filename: string, overrides: Record<string, unknown>) {
    const path = new URL(filename, sdkRoot)
    const localRequire = createRequire(path)
    const exports: Record<string, unknown> = {}
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    runInNewContext(compiled.outputText, {
      exports,
      require: (specifier: string) => overrides[specifier] ?? localRequire(specifier),
    })
    return exports
  }
  const syntheticUtils = {
    ...utils,
    loadOptionalSetting: (options: { settingValue?: string; environmentVariableName: string }) =>
      options.settingValue ?? environment[options.environmentVariableName],
    loadSetting: (options: { settingValue?: string; environmentVariableName: string }) => {
      const value = options.settingValue ?? environment[options.environmentVariableName]
      assert.ok(value)
      return value
    },
  }
  const base = compileSdk("google-vertex-provider-base.ts", {
    "@ai-sdk/provider-utils": syntheticUtils,
  })
  const authProjects: (string | undefined)[] = []
  const auth = compileSdk("google-vertex-auth-google-auth-library.ts", {
    "google-auth-library": {
      GoogleAuth: class {
        constructor(options: { projectId?: string }) {
          authProjects.push(options.projectId)
        }
        async getClient() {
          return {
            getAccessToken: async () => {
              authCalls++
              return { token: "synthetic-oauth-token" }
            },
          }
        }
      },
    },
  })
  const sdk = compileSdk("google-vertex-provider.ts", {
    "@ai-sdk/provider-utils": syntheticUtils,
    "./google-vertex-provider-base": base,
    "./google-vertex-auth-google-auth-library": auth,
  })
  const create = sdk.createGoogleVertex
  assert.equal(typeof create, "function")
  // Runtime narrowing avoids casting SDK mocks to incompatible model types.
  if (typeof create !== "function") throw new Error("SDK factory missing")
  const harness = routingHarness()
  harness.providerModel(entry("gemini-4-argon", "medium"))
  const options = harness.settings[0]
  assert.ok(options)
  const model = create({
    ...options,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "https://aiplatform.eu.rep.googleapis.com/v1beta1/projects/synthetic-project/locations/eu/publishers/google/models/gemini-4-argon:generateContent")
      const headers = new Headers(init?.headers)
      assert.equal(headers.get("authorization"), "Bearer synthetic-oauth-token")
      assert.equal(headers.has("x-goog-api-key"), false)
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "Hello" }] }, finishReason: "STOP" }] }), { headers: { "content-type": "application/json" } })
    },
  })("gemini-4-argon")
  await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] })
  assert.equal(authCalls, 1)
  assert.equal(authProjects.at(-1), "synthetic-project")
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
