import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import type { ToolPart } from "../../lib/games/tool-parts"
import { ToolGroup } from "./tool-group"

// The installed tsx runner uses classic JSX for source files outside Next.
Object.assign(globalThis, { React })

const part = (id: string, state: string, extra = {}) =>
  ({
    type: "tool-read_file",
    toolCallId: id,
    state,
    input: { path: "game.js", secret: "PRIVATE_INPUT" },
    ...extra,
  }) as ToolPart

function render(parts: ToolPart[], locale = "en") {
  return renderToStaticMarkup(
    // Provider typing requires children in props for this non-JSX harness.
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, {
      locale,
      timeZone: "UTC",
      messages: locale === "en" ? en : es,
      children: createElement(ToolGroup, { parts }),
    })
  )
}

test("active groups nest ordered steps in Trace and expose failures without payloads", () => {
  const html = render([
    part("first", "output-available", { output: { error: "PRIVATE_ERROR" } }),
    part("second", "input-streaming"),
  ])
  assert.match(html, /Running 2 steps, 1 failed/)
  assert.match(html, /aria-expanded="true"/)
  assert.equal((html.match(/data-slot="trace"/g) ?? []).length, 2)
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 2)
  assert.match(html, /data-status="error"/)
  assert.match(html, /data-status="running"/)
  assert.ok(html.indexOf("Couldn") < html.indexOf("Reading game.js"))
  assert.doesNotMatch(html, /PRIVATE_INPUT|PRIVATE_ERROR/)
})

test("finished groups close automatically but keep their call steps mounted", () => {
  const html = render([
    part("one", "output-available", { output: {} }),
    part("two", "output-denied"),
  ])
  assert.match(html, /Finished 2 steps, 1 failed/)
  assert.match(html, /aria-expanded="false"/)
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /data-status="running"/)
  assert.match(
    render(
      [part("one", "input-available"), part("two", "input-streaming")],
      "es"
    ),
    /Ejecutando 2 pasos/
  )
})

test("a single call retains its marker rather than a Trace summary", () => {
  const html = render([part("one", "input-streaming")])
  assert.match(html, /data-slot="marker"/)
  assert.match(html, /Reading game.js/)
  assert.doesNotMatch(html, /data-slot="trace"|steps/)
})
