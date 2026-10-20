import assert from "node:assert/strict"
import test from "node:test"
import { APICallError } from "ai"
import {
  createFallbackModel,
  type ConcreteLanguageModel,
  type ServedCall,
} from "./fallback-model"
import { resolveModel, type ModelEntry } from "./model-registry"

type CallOptions = Parameters<ConcreteLanguageModel["doGenerate"]>[0]
const options: CallOptions = {
  prompt: [],
  providerOptions: {
    googleVertex: {
      thinkingConfig: { thinkingLevel: "minimal" },
      retained: true,
    },
    other: { retained: true },
  },
}
const stubProvider = () =>
  ({ specificationVersion: "v4" }) as ConcreteLanguageModel

for (const method of ["doGenerate", "doStream"] as const) {
  test(`${method} retains v4 and applies the serving candidate's effort, not the primary's`, async () => {
    const primary = resolveModel(
      "pro",
      "strong",
      undefined,
      stubProvider
    ).primary
    const peer = resolveModel("pro", "mid", undefined, stubProvider).primary
    const seen: CallOptions[] = []
    const served: ServedCall[] = []
    const unavailable = new Set<string>()
    const result = { sentinel: true }
    function model(entry: ModelEntry, fail: boolean): ConcreteLanguageModel {
      return {
        specificationVersion: "v4",
        provider: entry.provider,
        modelId: entry.providerModelId,
        supportedUrls: {},
        [method]: async (call: CallOptions) => {
          seen.push(call)
          if (fail)
            throw new APICallError({
              message: "missing model",
              url: "https://invalid.test",
              requestBodyValues: {},
              statusCode: 404,
              isRetryable: false,
            })
          return result
        },
      } as unknown as ConcreteLanguageModel
    }
    const composite = createFallbackModel(
      [
        { entry: primary, model: model(primary, true) },
        { entry: peer, model: model(peer, false) },
      ],
      {
        isUnavailable: (id) => unavailable.has(id),
        markUnavailable: (id) => {
          unavailable.add(id)
        },
        onServed: (call) => {
          served.push(call)
        },
      }
    )
    assert.equal(composite.specificationVersion, "v4")
    assert.equal(await composite[method](options), result)
    assert.deepEqual(
      seen.map((call) => call.providerOptions?.googleVertex),
      [
        {
          retained: true,
          thinkingConfig: { thinkingLevel: "high", includeThoughts: true },
        },
        {
          retained: true,
          thinkingConfig: { thinkingLevel: "medium", includeThoughts: true },
        },
      ]
    )
    const secondCall = seen[1]
    assert.ok(secondCall)
    assert.deepEqual(secondCall.providerOptions?.other, { retained: true })
    assert.deepEqual(served, [{ entryId: peer.id, fallbackFrom: primary.id }])
    assert.ok(unavailable.has(primary.id))
    assert.equal(await composite[method](options), result)
    assert.equal(seen.length, 3)
    assert.equal(
      options.providerOptions?.googleVertex?.thinkingConfig &&
        (
          options.providerOptions.googleVertex.thinkingConfig as {
            thinkingLevel: string
          }
        ).thinkingLevel,
      "minimal"
    )
  })
}
