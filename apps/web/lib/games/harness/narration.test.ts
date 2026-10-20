import assert from "node:assert/strict"
import * as nodeModule from "node:module"
import { test } from "node:test"

import type { SubagentTimelineEntry } from "./records"

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
// Same alias shim as `records.test.ts`: `narration.ts` takes its caps from
// `records.ts`, which imports `@/lib/ai/model-catalog`.
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

const { applyTimelineDelta, capTimeline, stripSummaryFromTimeline } =
  await import("./narration.ts")
const {
  MAX_NARRATION_CHARS_PER_ENTRY: PER_ENTRY,
  MAX_NARRATION_CHARS_PER_RECORD: PER_RECORD,
  MAX_TIMELINE_ENTRIES: MAX_ENTRIES,
  subagentRunRecordSchema,
} = await import("./records.ts")

/** The record a timeline is stamped onto, so the cap tests can run it through the REAL schema. */
const legacyRecord = {
  agentId: "agent",
  role: "explorer",
  displayName: "Scout",
  tier: "pro",
  slot: "light",
  modelId: "model",
  modelName: "Model",
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

/** Applies a whole scripted stream, the way `run-subagent.ts` applies each part as it arrives. */
function build(...deltas: SubagentTimelineEntry[]): SubagentTimelineEntry[] {
  return deltas.reduce<SubagentTimelineEntry[]>(
    (timeline, delta) => applyTimelineDelta(timeline, delta),
    []
  )
}

const reasoning = (text: string): SubagentTimelineEntry => ({
  kind: "reasoning",
  text,
})
const said = (text: string): SubagentTimelineEntry => ({ kind: "text", text })
const tool = (toolName: string): SubagentTimelineEntry => ({
  kind: "tool",
  toolName,
  ok: true,
})

function narrationChars(timeline: SubagentTimelineEntry[]): number {
  return timeline.reduce(
    (total, entry) =>
      entry.kind === "tool" ? total : total + entry.text.length,
    0
  )
}

function kinds(timeline: SubagentTimelineEntry[]): string[] {
  return timeline.map((entry) => entry.kind)
}

/** One narration entry of exactly `PER_ENTRY` characters, still recognisable by its label. */
function fullEntry(label: string): string {
  return `${label}${"x".repeat(PER_ENTRY - label.length)}`
}

test("consecutive reasoning deltas coalesce into a single entry", () => {
  const timeline = build(reasoning("Reading the "), reasoning("store first."))

  assert.equal(timeline.length, 1)
  assert.deepEqual(timeline[0], {
    kind: "reasoning",
    text: "Reading the store first.",
  })
})

test("a tool entry between two deltas opens a second narration entry", () => {
  const timeline = build(
    reasoning("Before."),
    tool("read_file"),
    reasoning("After.")
  )

  assert.deepEqual(kinds(timeline), ["reasoning", "tool", "reasoning"])
  assert.deepEqual(timeline[2], { kind: "reasoning", text: "After." })
})

test("reasoning and text are different kinds, so they never coalesce", () => {
  const timeline = build(
    reasoning("Thinking."),
    said("Saying."),
    said(" More.")
  )

  assert.deepEqual(kinds(timeline), ["reasoning", "text"])
  assert.deepEqual(timeline[1], { kind: "text", text: "Saying. More." })
})

test("an empty delta leaves the timeline untouched", () => {
  const timeline = build(reasoning("Only."))

  assert.deepEqual(applyTimelineDelta(timeline, reasoning("")), timeline)
})

test("a tool delta keeps the data of the call it settles", () => {
  const timeline = build(reasoning("Reading."), {
    kind: "tool",
    toolName: "read_file",
    path: "game/scene.ts",
    ok: false,
    error: "ENOENT",
  })

  assert.deepEqual(timeline[1], {
    kind: "tool",
    toolName: "read_file",
    path: "game/scene.ts",
    ok: false,
    error: "ENOENT",
  })
})

test("an entry over the per-entry cap keeps the newest characters and marks the cut", () => {
  const oldest = "OLD".repeat(1_000)
  const newest = "NEWEST"

  const timeline = build(
    reasoning(`${oldest}${"x".repeat(PER_ENTRY)}${newest}`)
  )
  const [entry] = timeline

  assert.equal(entry?.kind, "reasoning")
  const text = entry?.kind === "reasoning" ? entry.text : ""

  assert.equal(text.length, PER_ENTRY)
  assert.ok(
    text.startsWith("…"),
    "the cut is marked with a single leading ellipsis"
  )
  assert.equal(text.split("…").length, 2, "the marker appears exactly once")
  assert.ok(text.includes(newest), "the newest characters survive")
  assert.ok(
    text.endsWith(newest),
    "the surviving text ends where the stream ended"
  )
  assert.ok(!text.includes("OLD"), "the oldest characters are the ones dropped")
})

test("coalescing keeps trimming at the cap instead of growing without bound", () => {
  let timeline: SubagentTimelineEntry[] = []

  for (let index = 0; index < 10; index += 1) {
    const chunk = `chunk-${index}-`.padEnd(600, "x")
    timeline = applyTimelineDelta(timeline, reasoning(chunk))
  }

  const [entry] = timeline
  const text = entry?.kind === "reasoning" ? entry.text : ""

  assert.equal(timeline.length, 1)
  assert.equal(text.length <= PER_ENTRY, true)
  assert.ok(text.startsWith("…"))
  assert.ok(text.includes("chunk-9-"), "the last chunk is kept")
  assert.ok(!text.includes("chunk-0-"), "the first chunk is gone")
})

test("the record cap drops the oldest narration whole and never drops a tool entry", () => {
  const atCap = build(
    tool("t0"),
    reasoning(fullEntry("R1")),
    tool("t1"),
    reasoning(fullEntry("R2")),
    tool("t2"),
    reasoning(fullEntry("R3")),
    tool("t3"),
    reasoning(fullEntry("R4")),
    tool("t4")
  )

  assert.equal(narrationChars(atCap), PER_RECORD)

  const timeline = applyTimelineDelta(atCap, reasoning(fullEntry("R5")))

  assert.ok(narrationChars(timeline) <= PER_RECORD)
  assert.equal(timeline.filter((entry) => entry.kind === "tool").length, 5)
  assert.equal(timeline.filter((entry) => entry.kind !== "tool").length, 4)
  assert.equal(
    timeline[0]?.kind,
    "tool",
    "the timeline still starts with its oldest tool entry"
  )
  assert.ok(
    !timeline.some(
      (entry) => entry.kind === "reasoning" && entry.text.includes("R1")
    ),
    "the oldest narration entry is the one evicted"
  )
  assert.ok(
    timeline.some(
      (entry) => entry.kind === "reasoning" && entry.text.includes("R5")
    ),
    "the newest narration entry survives"
  )
})

test("the entry cap drops the oldest narration first and never a tool entry", () => {
  let timeline: SubagentTimelineEntry[] = []

  // 65 pairs: 130 entries, past the cap, while 65 tool entries stay under it.
  for (let index = 0; index < 65; index += 1) {
    timeline = applyTimelineDelta(timeline, said(`text-${index} `))
    timeline = applyTimelineDelta(timeline, {
      kind: "tool",
      toolName: `tool-${index}`,
      ok: true,
    })
  }

  const tools = timeline.filter((entry) => entry.kind === "tool")

  assert.equal(timeline.length, MAX_ENTRIES)
  assert.equal(tools.length, 65)
  assert.equal(
    timeline.filter((entry) => entry.kind !== "tool").length,
    MAX_ENTRIES - 65
  )
  assert.equal(timeline[0]?.kind, "tool")
  assert.deepEqual(
    tools.map((entry) => (entry.kind === "tool" ? entry.toolName : "")),
    Array.from({ length: 65 }, (_, index) => `tool-${index}`),
    "tool entries keep their own arrival order"
  )
})

test("capTimeline tail-trims a lone entry instead of dropping the only thing left", () => {
  const capped = capTimeline([
    { kind: "text", text: `${"A".repeat(PER_RECORD * 2)}NEWEST` },
  ])
  const [entry] = capped
  const text = entry?.kind === "text" ? entry.text : ""

  assert.equal(capped.length, 1)
  assert.equal(text.length, PER_ENTRY, "the tighter per-entry cap wins")
  assert.ok(text.startsWith("…"))
  assert.ok(text.endsWith("NEWEST"))
})

test("capTimeline leaves a timeline already inside every cap alone", () => {
  const timeline = build(
    reasoning("Short."),
    tool("read_file"),
    said("Shorter.")
  )

  assert.deepEqual(capTimeline(timeline), timeline)
})

/** Whether a string carries a surrogate code unit that is not part of a pair — invalid UTF-16, and rejected by `jsonb`. */
function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)

      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
      continue
    }

    if (code >= 0xdc00 && code <= 0xdfff) return true
  }

  return false
}

test("a tool-only run past the entry cap still parses, oldest tool entries dropped", () => {
  let timeline: SubagentTimelineEntry[] = []

  // A 30-step builder reading 3-4 files per step settles well past 120 calls.
  for (let index = 0; index < 130; index += 1) {
    timeline = applyTimelineDelta(timeline, {
      kind: "tool",
      toolName: `tool-${index}`,
      toolCallId: `call-${index}`,
      ok: true,
    })
  }

  const parsed = subagentRunRecordSchema.safeParse({
    ...legacyRecord,
    timeline,
  })

  assert.equal(
    parsed.success,
    true,
    "a run with more settled calls than entries must still parse"
  )
  assert.ok(timeline.length <= MAX_ENTRIES)
  assert.equal(timeline.length, MAX_ENTRIES)

  const names = timeline.map((entry) =>
    entry.kind === "tool" ? entry.toolName : ""
  )

  assert.equal(names.at(-1), "tool-129", "the newest tool entry survives")
  assert.equal(names.includes("tool-129"), true)
  assert.equal(names.includes("tool-0"), false, "the oldest are the ones gone")
  assert.equal(names.includes("tool-10"), true)
})

test("a tool delta keeps the id of the call it settled", () => {
  const timeline = build({
    kind: "tool",
    toolName: "read_file",
    toolCallId: "call-7",
    ok: true,
  })

  assert.deepEqual(timeline[0], {
    kind: "tool",
    toolName: "read_file",
    toolCallId: "call-7",
    ok: true,
  })
})

test("tail trim never splits a surrogate pair", () => {
  const source = `${"x".repeat(100)}😀${"y".repeat(3_998)}`

  // The surviving window would start on the emoji's LOW half (0xDE00).
  assert.equal(source.charCodeAt(101) >= 0xdc00, true)

  const [entry] = build(said(source))
  const text = entry?.kind === "text" ? entry.text : ""

  assert.equal(hasLoneSurrogate(text), false)
  assert.ok(text.length <= PER_ENTRY)
  assert.ok(text.startsWith("…"))
  assert.ok(text.endsWith("y".repeat(10)))
  assert.equal(
    text.includes("😀"),
    false,
    "the whole pair is dropped, not half"
  )
})

test("the final report is dropped from the timeline instead of being stored twice", () => {
  const report = "## Report\n\nEverything is wired up."
  const timeline = build(reasoning("Writing the report."), said(report))

  assert.deepEqual(stripSummaryFromTimeline(timeline, report), [
    { kind: "reasoning", text: "Writing the report." },
  ])
})

test("a report entry that was tail-trimmed is still recognised as the same text", () => {
  const report = `Long report: ${"z".repeat(PER_ENTRY * 2)}`
  const timeline = build(said(report))
  const [entry] = timeline

  assert.ok(entry?.kind === "text" && entry.text.startsWith("…"))

  assert.deepEqual(stripSummaryFromTimeline(timeline, report), [])
})

test("only the trailing run of report text is dropped, never text before a tool", () => {
  const report = "Done."
  const timeline = build(said(report), tool("read_file"))

  assert.deepEqual(stripSummaryFromTimeline(timeline, report), timeline)
})

test("a timeline whose text is not the report's tail is left alone", () => {
  const timeline = build(
    reasoning("Reading."),
    said("I will now check the files.")
  )

  assert.deepEqual(
    stripSummaryFromTimeline(timeline, "A different report."),
    timeline
  )
})

test("a run with no text entries keeps an untouched timeline", () => {
  const timeline = build(reasoning("Only thinking."), tool("read_file"))

  assert.deepEqual(stripSummaryFromTimeline(timeline, "Any summary."), timeline)
})
