import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
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
