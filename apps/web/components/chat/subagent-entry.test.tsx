import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import type { SubagentRunRecord } from "../../lib/games/harness/records"
import { SubagentEntry, subagentStatusKey } from "./subagent-entry"

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
  edits: [],
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
      <SubagentEntry record={{ ...record, ...extra }} onSelect={() => {}} />
    </NextIntlClientProvider>
  )
}

test("terminal history replaces the marker with closed mounted Trace and independent report", () => {
  const html = render()
  assert.match(html, /data-slot="trace"/)
  assert.doesNotMatch(
    html,
    /data-slot="marker"|PRIVATE_PROMPT|PRIVATE_TERMINAL/
  )
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2)
  assert.match(html, /<strong>Final report<\/strong>/)
  assert.match(html, /No recorded tool calls/)
  assert.match(html, /View details/)
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/)
})

test("recorded calls preserve order, repeated paths and failure labels without raw errors", () => {
  const html = render({
    toolCalls: [
      { toolCallId: "a", toolName: "read_file", path: "same.js", ok: true },
      {
        toolCallId: "b",
        toolName: "write_file",
        path: "same.js",
        ok: false,
        error: "PRIVATE_ERROR",
      },
      { toolCallId: "c", toolName: "unknown", ok: true },
    ],
  })
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 3)
  assert.equal((html.match(/same.js/g) ?? []).length, 2)
  assert.ok(html.indexOf("Read same.js") < html.indexOf("Couldn"))
  assert.match(html, /data-status="error"/)
  assert.doesNotMatch(html, /PRIVATE_ERROR/)
})

test("a timeline renders reasoning, text and tool labels in arrival order", () => {
  const html = render({
    status: "running",
    activity: "exploring",
    toolCalls: [
      { toolCallId: "z", toolName: "write_file", path: "ignored.js", ok: true },
    ],
    timeline: [
      { kind: "reasoning", text: "Checking the **store** first." },
      { kind: "text", text: "The store is **wired**." },
      {
        kind: "tool",
        toolName: "read_file",
        toolCallId: "a",
        path: "store.js",
        ok: true,
      },
    ],
  })

  /**
   * The reasoning here is already finished, so it is the thread's closed
   * "Thought" disclosure — its line is what marks its place in the order. A
   * reasoning entry is only open while it is still the run's current one,
   * which the second render below pins down.
   */
  const reasoning = html.indexOf("Thought")
  const text = html.indexOf("<strong>wired</strong>")
  const tool = html.indexOf("Read store.js")

  assert.ok(reasoning >= 0, "the reasoning entry is rendered")
  assert.ok(reasoning < text, "the text entry comes after the reasoning")
  assert.ok(text < tool, "the tool line comes last")
  /**
   * The timeline REPLACES the flat list: `toolCalls` is still on the record,
   * and rendering both would print every call twice.
   */
  assert.doesNotMatch(html, /ignored\.js/)

  const live = render({
    status: "running",
    timeline: [
      { kind: "text", text: "The store is **wired**." },
      { kind: "reasoning", text: "Checking the **store** first." },
    ],
  })

  assert.match(live, /Checking the <strong>store<\/strong> first\./)
  assert.ok(
    live.indexOf("<strong>wired</strong>") <
      live.indexOf("Checking the <strong>store</strong>")
  )
})

test("a record persisted before the timeline still renders its tool list", () => {
  const html = render({
    timeline: [],
    toolCalls: [
      { toolCallId: "a", toolName: "read_file", path: "legacy.js", ok: true },
      { toolCallId: "b", toolName: "write_file", path: "legacy.js", ok: false },
    ],
  })

  assert.equal((html.match(/role="listitem"/g) ?? []).length, 2)
  assert.match(html, /Read legacy\.js/)
  assert.match(html, /write legacy\.js/)
  // No empty timeline shell around the list a legacy record already renders.
  assert.doesNotMatch(html, /data-slot="subagent-timeline"/)
})

test("a timeline text entry and the report are each rendered once", () => {
  const html = render({
    timeline: [
      { kind: "reasoning", text: "PRIVATE_REASONING" },
      { kind: "text", text: "Setting the **scene** up." },
    ],
  })

  assert.equal(
    (html.match(/Setting the <strong>scene<\/strong> up\./g) ?? []).length,
    1
  )
  assert.equal((html.match(/<strong>Final report<\/strong>/g) ?? []).length, 1)
  /**
   * The reasoning of a finished run is a closed disclosure, and the report is
   * `summary` alone — the timeline must not feed either into the other.
   */
  assert.doesNotMatch(html, /PRIVATE_REASONING/)
})

test("running snapshots open without exposing a completed report or fabricated calls", () => {
  for (const activity of [
    "starting",
    "thinking",
    "stopping",
    "Reading game.js",
  ]) {
    const html = render({ status: "running", activity })
    assert.match(html, /aria-expanded="true"/)
    assert.doesNotMatch(html, /Final report|role="listitem"/)
    assert.match(
      html,
      activity === "stopping" ? /is stopping/ : /data-status="running"/
    )
  }
})

test("each terminal outcome has a sentence and only normal reports are disclosed", () => {
  const phrases = {
    done: "finished",
    partial: "partway",
    blocked: "input",
    error: "failed",
    aborted: "cancelled",
    skipped: "skipped",
    unavailable: "unavailable",
  } as const
  for (const [status, phrase] of Object.entries(phrases)) {
    const html = render({ status: status as SubagentRunRecord["status"] })
    assert.match(html, new RegExp(phrase))
    assert.equal(
      html.includes("<strong>Final report</strong>"),
      ["done", "partial", "blocked"].includes(status)
    )
    assert.equal(
      subagentStatusKey(status as SubagentRunRecord["status"]),
      `status${status[0]!.toUpperCase()}${status.slice(1)}`
    )
  }
  for (const status of ["error", "aborted"] as const) {
    assert.doesNotMatch(
      render({
        status,
        summary: "PRIVATE_EXCEPTION",
        activity: "PRIVATE_EXCEPTION",
      }),
      /PRIVATE_EXCEPTION/
    )
  }
  assert.doesNotMatch(render({ summary: "  " }), /<strong>/)
  assert.match(render({}, "es"), /Ver detalles/)
})
