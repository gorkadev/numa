import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import { CodeWrapProvider } from "./code-wrap"
import en from "../../messages/en.json"
import es from "../../messages/es.json"
import { FileCode, FileViewer } from "./file-viewer"

Object.assign(globalThis, { React })

function render(node: React.ReactNode, messages: object = en, locale = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {node}
    </NextIntlClientProvider>
  )
}

const base = { gameId: "g1", previewToken: "tok", version: 2 }

test("FileViewer shows an image, SVG included, through the preview proxy", () => {
  const png = render(<FileViewer {...base} file={{ name: "hero.png", path: "assets/hero.png", size: 10 }} />)
  const svg = render(<FileViewer {...base} file={{ name: "icon.svg", path: "icon.svg", size: 10 }} />)

  assert.match(png, /<img[^>]*src="\/api\/games\/g1\/preview\/tok\/assets\/hero\.png\?v=2"/)
  assert.match(svg, /<img[^>]*src="\/api\/games\/g1\/preview\/tok\/icon\.svg\?v=2"/)
  assert.doesNotMatch(svg, /<svg[^>]*xmlns/)
})

test("FileViewer plays audio and video with native controls", () => {
  const audio = render(<FileViewer {...base} file={{ name: "jump.wav", path: "jump.wav", size: 10 }} />)
  const video = render(<FileViewer {...base} file={{ name: "intro.mp4", path: "intro.mp4", size: 10 }} />)

  assert.match(audio, /<audio[^>]*controls=""[^>]*src="\/api\/games\/g1\/preview\/tok\/jump\.wav\?v=2"/)
  assert.match(video, /<video[^>]*controls=""[^>]*src="\/api\/games\/g1\/preview\/tok\/intro\.mp4\?v=2"/)
})

test("FileViewer explains a binary file instead of rendering it", () => {
  const html = render(<FileViewer {...base} file={{ name: "ship.fbx", path: "ship.fbx", size: 2048 }} />)

  assert.match(html, /ship\.fbx/)
  assert.match(html, /can(&#x27;|')t be previewed/)
  assert.match(html, /2 kB/)
})

test("FileViewer starts a text file in its loading state", () => {
  const html = render(<FileViewer {...base} file={{ name: "main.js", path: "main.js", size: 10 }} />)

  assert.match(html, /Loading main\.js/)
})

test("FileViewer explains an oversized text file without requesting it", () => {
  const html = render(<FileViewer {...base} file={{ name: "huge.js", path: "huge.js", size: 10 * 1024 * 1024 }} />)

  assert.match(html, /too large to preview/)
  assert.doesNotMatch(html, /Loading/)
})

test("FileCode renders the text with line numbers, copy and wrap controls", () => {
  const html = render(<FileCode path="src/main.js" language="javascript" content={"const a = 1\nconst b = 2\n"} />)

  assert.match(html, /src\/main\.js/)
  assert.match(html, /data-numbered="true"/)
  assert.equal(html.match(/data-slot="code-block-line"/g)?.length, 2)
  assert.match(html, /aria-label="Copy code"/)
  assert.match(html, /aria-label="Wrap lines"/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /data-wrap="true"/)
})

test("FileCode starts unwrapped when the player turned wrapping off", () => {
  const html = render(
    <CodeWrapProvider wrap={false}>
      <FileCode path="a.js" language="javascript" content={"const a = 1\n"} />
    </CodeWrapProvider>
  )

  assert.match(html, /aria-pressed="false"/)
  assert.doesNotMatch(html, /data-wrap="/)
})

test("FileViewer opens a glTF model in the 3D viewer, loading it from the preview proxy", () => {
  const html = render(
    <FileViewer {...base} file={{ name: "12_Mimic.gltf", path: "assets/cards/12_Mimic.gltf", size: 4096 }} />
  )

  assert.match(html, /data-slot="model-viewer"/)
  assert.match(html, /data-src="\/api\/games\/g1\/preview\/tok\/assets\/cards\/12_Mimic\.gltf\?v=2"/)
  assert.match(html, /Loading 12_Mimic\.gltf…/)
  assert.doesNotMatch(html, /can(&#x27;|')t be previewed/)
})

test("FileViewer is translated", () => {
  const html = render(
    <FileViewer {...base} file={{ name: "ship.fbx", path: "ship.fbx", size: 2048 }} />,
    es,
    "es"
  )

  assert.match(html, /no se puede previsualizar/)
})
