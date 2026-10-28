import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import { CodeWrapProvider } from "./code-wrap"
import { MarkdownCode } from "./markdown-code"
import { Markdown } from "./markdown"

Object.assign(globalThis, { React })

function render(children: React.ReactNode, locale = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={locale === "en" ? en : es}
    >
      {children}
    </NextIntlClientProvider>
  )
}

test("fences use full shared content, lines and copy composition", () => {
  const html = render(
    <MarkdownCode className="language-ts">{"const x = 1\n\n"}</MarkdownCode>
  )
  for (const slot of [
    "code-block",
    "code-block-header",
    "code-block-title",
    "code-block-actions",
    "code-block-copy-button",
    "code-block-content",
    "code-block-line",
  ]) {
    assert.ok(html.includes(`data-slot="${slot}"`), slot)
  }
  assert.match(html, /data-numbered="true"/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /aria-label="Wrap lines"/)
  assert.match(html, /aria-label="Copy code"/)
  assert.equal((html.match(/data-slot="code-block-line"/g) ?? []).length, 2)
  assert.equal((html.match(/<pre\b/g) ?? []).length, 1)
})

test("inline code preserves attributes and escaping without block controls", () => {
  const html = render(
    <MarkdownCode inline className="sample" title="example">
      {"<tag> & value"}
    </MarkdownCode>
  )
  assert.equal(
    html,
    '<code class="sample" title="example">&lt;tag&gt; &amp; value</code>'
  )
})

test("actual Markdown distinguishes language-less fences from inline code", () => {
  const html = render(
    <Markdown>{"Use `x < y`.\n\n```\n<tag> & value\n\n```"}</Markdown>,
    "es"
  )
  assert.match(html, /<p>Use <code>x &lt; y<\/code>\.<\/p>/)
  assert.match(html, /aria-label="Copiar código"/)
  assert.match(html, /aria-label="Ajustar líneas"/)
  assert.match(html, /&lt;tag&gt; &amp; value/)
  assert.equal((html.match(/<pre\b/g) ?? []).length, 1)
  assert.equal((html.match(/<code\b/g) ?? []).length, 2)
  assert.equal((html.match(/data-slot="code-block-line"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /node="|inline="|<tag>/)
})

test("unknown languages and growing source retain readable fallback", () => {
  for (const source of ["", "let", "  let x = 1", "  let x = 1\n\n"]) {
    const html = render(
      <MarkdownCode className="language-unknown">{source}</MarkdownCode>
    )
    assert.match(html, /data-slot="code-block-content"/)
    assert.ok(html.includes(source.replace(/\n$/, "").split("\n")[0]!))
  }
})

test("fences start unwrapped when the player turned wrapping off", () => {
  const html = render(
    <CodeWrapProvider wrap={false}>
      <MarkdownCode className="language-ts">{"const x = 1\n"}</MarkdownCode>
    </CodeWrapProvider>
  )
  assert.match(html, /aria-pressed="false"/)
  assert.doesNotMatch(html, /data-wrap="/)
})
