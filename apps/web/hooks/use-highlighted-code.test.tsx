import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadHighlighter, MAX_HIGHLIGHTED_LINE } from "@/lib/highlighter"

import { useHighlightedCode } from "./use-highlighted-code"

Object.assign(globalThis, { React })

function PlainLines({ value, language }: { value: string; language: string }) {
  const lines = useHighlightedCode(value, language)
  return (
    <>
      {lines.map((line, index) => (
        <span key={index}>{line}</span>
      ))}
    </>
  )
}

test("hook returns escaped plain lines before asynchronous highlighting", () => {
  assert.equal(
    renderToStaticMarkup(<PlainLines value={"  <tag> &\n\n"} language="tsx" />),
    "<span>  &lt;tag&gt; &amp;</span><span></span>"
  )
})

test("hook removes only one trailing newline for unknown language and streamed snapshots", () => {
  for (const value of ["", "x", "x\n", "x\n\n", "x\n\n  y"]) {
    const expected = value
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => `<span>${line}</span>`)
      .join("")
    assert.equal(
      renderToStaticMarkup(<PlainLines value={value} language="unknown" />),
      expected
    )
  }
})

test("a language already loaded highlights on the first render", async () => {
  await loadHighlighter("javascript")

  assert.match(
    renderToStaticMarkup(<PlainLines value={"const a = 1"} language="javascript" />),
    /--shiki-light/
  )
})

test("a line too long to color skips the highlighter and keeps the text", async () => {
  await loadHighlighter("javascript")

  const longLine = `const a = "${"x".repeat(MAX_HIGHLIGHTED_LINE)}"`

  assert.equal(
    renderToStaticMarkup(<PlainLines value={`let b\n${longLine}`} language="javascript" />),
    `<span>let b</span><span>${longLine.replaceAll('"', "&quot;")}</span>`
  )
})
