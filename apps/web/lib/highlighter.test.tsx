import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { highlightCode, loadHighlighter } from "./highlighter"

Object.assign(globalThis, { React })
const markup = (lines: React.ReactNode[]) => renderToStaticMarkup(<>{lines}</>)

test("aliases highlight real tokens and unknown languages use plain fallback", async () => {
  assert.equal(await loadHighlighter("not-a-language"), null)
  assert.equal(await highlightCode("<tag>", "text"), null)
  const source = 'const value = "<tag> &"'
  const alias = await highlightCode(source, "TS")
  const canonical = await highlightCode(source, "typescript")
  assert.ok(alias)
  assert.ok(canonical)
  assert.equal(markup(alias), markup(canonical))
  assert.match(markup(alias), /--shiki-light/)
  assert.match(markup(alias), /&lt;tag&gt; &amp;/)
})

test("grammar state continues streamed multiline comments like a whole pass", async () => {
  const highlighter = await loadHighlighter("js")
  assert.ok(highlighter)
  const first = highlighter.highlight("/* comment")
  const rest = highlighter.highlight(
    "still comment\n*/ const x = 1",
    first.state
  )
  const whole = highlighter.highlight(
    "/* comment\nstill comment\n*/ const x = 1"
  )
  assert.equal(markup([...first.lines, ...rest.lines]), markup(whole.lines))
  assert.equal(whole.lines.length, 3)
})
