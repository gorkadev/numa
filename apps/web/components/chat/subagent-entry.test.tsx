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
