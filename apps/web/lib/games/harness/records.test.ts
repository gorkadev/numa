import assert from "node:assert/strict"
import * as nodeModule from "node:module"
import { test } from "node:test"

// The installed runtime supports synchronous hooks; bundled Node types predate them.
type Resolve = (specifier: string, context: object) => { url: string }
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: { resolve: (specifier: string, context: object, next: Resolve) => { url: string } }) => void
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/ai/model-catalog") {
      return nextResolve(new URL("../../ai/model-catalog.ts", import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  },
})
const { subagentRunRecordSchema, collectSubagentRuns } = await import("./records.ts")
const legacy = {
  agentId: "old", role: "explorer", displayName: "Scout", tier: "pro", slot: "light",
  modelId: "removed-model", modelName: "Historical (high)", status: "done", activity: "",
  steps: 0, toolCalls: [], edits: [], skills: [], summary: "Complete",
  tokens: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 },
}

test("old records remain valid without effort or prompt and survive collection", () => {
  const record = subagentRunRecordSchema.parse(legacy)
  assert.equal(record.effort, undefined)
  assert.equal(record.prompt, "")
  assert.equal(collectSubagentRuns([{ record: legacy }]).length, 1)
})

test("structured effort survives parsing and collection", () => {
  for (const effort of ["minimal", "low", "medium", "high"]) {
    assert.equal(collectSubagentRuns([{ record: { ...legacy, effort } }])[0]?.effort, effort)
  }
  assert.equal(subagentRunRecordSchema.safeParse({ ...legacy, effort: "future" }).success, false)
})
