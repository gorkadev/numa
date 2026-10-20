import assert from "node:assert/strict"
import * as nodeModule from "node:module"
import { test } from "node:test"

// The installed runtime supports synchronous hooks; bundled Node types predate them.
type Resolve = (specifier: string, context: object) => { url: string }
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: object,
      next: Resolve
    ) => { url: string }
  }) => void
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/ai/model-catalog") {
      return nextResolve(
        new URL("../../ai/model-catalog.ts", import.meta.url).href,
        context
      )
    }
    return nextResolve(specifier, context)
  },
})
const {
  MAX_NARRATION_CHARS_PER_ENTRY,
  MAX_TIMELINE_ENTRIES,
  collectSubagentRuns,
  subagentRunRecordSchema,
} = await import("./records.ts")
const legacy = {
  agentId: "old",
  role: "explorer",
  displayName: "Scout",
  tier: "pro",
  slot: "light",
  modelId: "removed-model",
  modelName: "Historical (high)",
  status: "done",
  activity: "",
  steps: 0,
  toolCalls: [],
  edits: [],
  skills: [],
  summary: "Complete",
  tokens: {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
  },
}

test("old records remain valid without effort, prompt or timeline and survive collection", () => {
  const record = subagentRunRecordSchema.parse(legacy)
  assert.equal(record.effort, undefined)
  assert.equal(record.prompt, "")
  assert.deepEqual(record.timeline, [])
  assert.deepEqual(collectSubagentRuns([{ record: legacy }])[0]?.timeline, [])
})

test("structured effort survives parsing and collection", () => {
  for (const effort of ["minimal", "low", "medium", "high"]) {
    assert.equal(
      collectSubagentRuns([{ record: { ...legacy, effort } }])[0]?.effort,
      effort
    )
  }
  assert.equal(
    subagentRunRecordSchema.safeParse({ ...legacy, effort: "future" }).success,
    false
  )
})

test("a timeline parses in arrival order and reaches a collected record", () => {
  const timeline = [
    { kind: "reasoning", text: "Reading the game first." },
    { kind: "text", text: "Now writing it." },
    {
      kind: "tool",
      toolName: "write_file",
      toolCallId: "call-1",
      path: "game/scene.ts",
      ok: true,
    },
    {
      kind: "tool",
      toolName: "delete_file",
      toolCallId: "call-2",
      ok: false,
      error: "ENOENT",
    },
  ]

  const record = subagentRunRecordSchema.parse({ ...legacy, timeline })

  assert.deepEqual(record.timeline, timeline)
  assert.deepEqual(
    collectSubagentRuns([{ record: { ...legacy, timeline } }])[0]?.timeline,
    timeline
  )
})

test("a tool timeline entry may omit its call id, like its path", () => {
  const record = subagentRunRecordSchema.parse({
    ...legacy,
    timeline: [{ kind: "tool", toolName: "read_file", ok: true }],
  })

  assert.deepEqual(record.timeline, [
    { kind: "tool", toolName: "read_file", ok: true },
  ])
})

test("a timeline entry rejects an unknown kind or a tool entry without ok", () => {
  const timeline = (...entries: unknown[]) => ({ ...legacy, timeline: entries })

  assert.equal(
    subagentRunRecordSchema.safeParse(timeline({ kind: "edit" })).success,
    false
  )
  assert.equal(
    subagentRunRecordSchema.safeParse(
      timeline({ kind: "tool", toolName: "read_file" })
    ).success,
    false
  )
  assert.equal(
    subagentRunRecordSchema.safeParse(timeline({ kind: "text" })).success,
    false
  )
})

test("the timeline stays inside its published caps", () => {
  const entry = { kind: "text", text: "x" }
  const atCap = Array.from({ length: MAX_TIMELINE_ENTRIES }, () => entry)

  assert.equal(
    subagentRunRecordSchema.safeParse({ ...legacy, timeline: atCap }).success,
    true
  )
  assert.equal(
    subagentRunRecordSchema.safeParse({
      ...legacy,
      timeline: [...atCap, entry],
    }).success,
    false
  )
  assert.equal(
    subagentRunRecordSchema.safeParse({
      ...legacy,
      timeline: [
        { kind: "text", text: "x".repeat(MAX_NARRATION_CHARS_PER_ENTRY + 1) },
      ],
    }).success,
    false
  )
})
