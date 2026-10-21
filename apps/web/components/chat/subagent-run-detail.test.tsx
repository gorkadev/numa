import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import type { SubagentRunRecord } from "../../lib/games/harness/records"
import { SubagentRunDetail } from "./subagent-run-detail"

Object.assign(globalThis, { React })

const record: SubagentRunRecord = {
  agentId: "agent",
  role: "explorer",
  displayName: "Explorer",
  tier: "balanced",
  slot: "mid",
  modelId: "model",
  modelName: "Model",
  status: "done",
  activity: "PRIVATE_TERMINAL",
  steps: 2,
  toolCalls: [],
  edits: ["game/level.js"],
  timeline: [],
  skills: [],
  tokens: {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
  },
  prompt: "PRIVATE_PROMPT",
  summary: "**Final report**",
}

function render(extra: Partial<SubagentRunRecord> = {}, locale = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={locale === "en" ? en : es}
    >
      <SubagentRunDetail record={{ ...record, ...extra }} />
    </NextIntlClientProvider>
  )
}

const readLevel = {
  kind: "tool",
  toolName: "read_file",
  toolCallId: "call-1",
  path: "level.js",
  ok: true,
} as const

test("the body reads prompt, trace, edited files, then the report", () => {
  const html = render({
    status: "running",
    activity: "exploring",
    timeline: [
      { kind: "reasoning", text: "Checking the level file." },
      readLevel,
    ],
  })

  /**
   * The reasoning here is a finished entry, so what marks its place is the
   * thread's own "Thought" line — the text is inside a closed disclosure,
   * exactly as it is in the thread. The text itself is asserted below, for
   * the entry a live run still has open.
   */
  const prompt = html.indexOf("PRIVATE_PROMPT")
  const reasoning = html.indexOf("Thought")
  const tool = html.indexOf("Read level.js")
  const files = html.indexOf("Edited files")
  const report = html.indexOf("<strong>Final report</strong>")

  assert.ok(prompt >= 0 && prompt < reasoning, "input comes first")
  assert.ok(reasoning < tool, "the trace follows the input")
  assert.ok(tool < files, "edited files follow the trace")
  assert.ok(files < report, "the report is the last content section")
  assert.match(html, /data-slot="subagent-timeline"/)
  assert.equal(
    (html.match(/<strong>Final report<\/strong>/g) ?? []).length,
    1,
    "the report is not repeated inside the trace"
  )
})

test("the trace renders a reasoning entry through the thread's reasoning block", () => {
  const html = render({
    status: "running",
    timeline: [
      readLevel,
      { kind: "reasoning", text: "Checking the **level file**." },
    ],
  })

  const reasoning = html.indexOf("Checking the <strong>level file</strong>.")
  const files = html.indexOf("Edited files")

  assert.ok(reasoning >= 0, "the reasoning text is rendered")
  assert.ok(reasoning < files, "the trace stays above the edited files")
  assert.doesNotMatch(html, /\*\*level file\*\*/)
})

test("a record with a timeline does not repeat its calls", () => {
  const html = render({
    timeline: [readLevel],
    toolCalls: [
      { toolCallId: "z", toolName: "write_file", path: "ignored.js", ok: true },
    ],
  })

  assert.doesNotMatch(html, /Tool calls/)
  assert.match(html, /Read level\.js/)
  assert.doesNotMatch(html, /ignored\.js/)
})

test("a record persisted before the timeline keeps its call list", () => {
  const html = render({
    timeline: [],
    toolCalls: [
      { toolCallId: "a", toolName: "read_file", path: "legacy.js", ok: true },
      {
        toolCallId: "b",
        toolName: "write_file",
        path: "legacy.js",
        ok: false,
        error: "PRIVATE_ERROR",
      },
    ],
  })

  assert.match(html, /Tool calls \(2\)/)
  assert.match(html, /Read legacy\.js/)
  assert.match(html, /write legacy\.js/)
  assert.doesNotMatch(html, /data-slot="subagent-timeline"/)
  // The error stays one hover away, as this panel has always done it.
  assert.match(html, /title="PRIVATE_ERROR"/)
})

test("a running record with no report says the output is pending", () => {
  const html = render({ status: "running", summary: "" })

  assert.match(html, /Waiting for the run to finish/)
  assert.doesNotMatch(html, /No output\./)
})

test("the trace label is translated", () => {
  assert.match(render({ timeline: [readLevel] }, "es"), /Traza/)
})
