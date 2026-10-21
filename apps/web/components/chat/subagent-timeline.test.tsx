import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import type { SubagentTimelineEntry } from "../../lib/games/harness/records"
import { SubagentTimeline } from "./subagent-timeline"

Object.assign(globalThis, { React })

function render(entries: SubagentTimelineEntry[], running = false) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <SubagentTimeline entries={entries} running={running} />
    </NextIntlClientProvider>
  )
}

test("an empty timeline renders nothing at all", () => {
  assert.equal(render([]), "")
})

test("a reasoning entry renders through the thread's own reasoning block", () => {
  const running = render(
    [{ kind: "reasoning", text: "Checking **the level file**." }],
    true
  )

  assert.match(running, /Thinking/)
  assert.match(running, /Checking <strong>the level file<\/strong>\./)

  /**
   * A reasoning entry of a finished run is a disclosure like any other: the
   * text is not in the document until the reader opens it.
   */
  const finished = render([
    { kind: "reasoning", text: "Checked the level file." },
  ])

  assert.match(finished, /Thought/)
  assert.match(finished, /aria-expanded="false"/)
  assert.doesNotMatch(finished, /Checked the level file\./)
})

test("a text entry goes through the shared Markdown renderer", () => {
  const html = render([{ kind: "text", text: "The store is **wired**." }])

  assert.match(html, /data-slot="subagent-timeline"/)
  assert.match(html, /The store is <strong>wired<\/strong>\./)
  assert.doesNotMatch(html, /\*\*wired\*\*/)
})

test("a successful tool entry draws the same line the entry draws today", () => {
  const html = render([
    {
      kind: "tool",
      toolName: "read_file",
      toolCallId: "call-1",
      path: "store.js",
      ok: true,
    },
  ])

  assert.match(html, /Read store\.js/)
  assert.doesNotMatch(html, /data-status="error"/)
})

test("a failed tool entry carries the error status without the raw error", () => {
  const html = render([
    {
      kind: "tool",
      toolName: "write_file",
      path: "store.js",
      ok: false,
      error: "PRIVATE_ERROR",
    },
  ])

  assert.match(html, /data-status="error"/)
  assert.match(html, /write store\.js/)
  assert.doesNotMatch(html, /PRIVATE_ERROR/)
})

test("entries render in arrival order, whatever their kinds are", () => {
  const html = render(
    [
      { kind: "reasoning", text: "First thought." },
      { kind: "text", text: "**Second** words." },
      { kind: "tool", toolName: "read_file", path: "third.js", ok: true },
      { kind: "reasoning", text: "Fourth thought." },
    ],
    true
  )

  // A finished reasoning entry is a closed disclosure, so its LINE is what
  // marks its place; the trailing one is still open and shows its text.
  const first = html.indexOf("Thought")
  const second = html.indexOf("<strong>Second</strong> words.")
  const third = html.indexOf("Read third.js")
  const fourth = html.indexOf("Fourth thought.")

  assert.ok(first >= 0 && first < second)
  assert.ok(second < third)
  assert.ok(third < fourth)
})

test("only the trailing reasoning entry of a live run is still thinking", () => {
  const html = render(
    [
      { kind: "reasoning", text: "Older thought." },
      { kind: "tool", toolName: "read_file", path: "store.js", ok: true },
      { kind: "reasoning", text: "Newer thought." },
    ],
    true
  )

  assert.equal((html.match(/data-slot="spinner"/g) ?? []).length, 1)
  assert.equal((html.match(/Thinking/g) ?? []).length, 1)
  assert.equal((html.match(/Thought/g) ?? []).length, 1)
})
