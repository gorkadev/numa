import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NewGameAvatar } from "./new-game-avatar.tsx"

const render = () => renderToStaticMarkup(createElement(NewGameAvatar))

test("creation avatar has stable local output and exact logo-blue body", () => {
  const markup = render()
  assert.equal(markup, render())
  assert.match(markup, /^<svg /)
  assert.match(markup, /width="84" height="84"/)
  assert.match(markup, /fill="#2563eb"/)
  assert.doesNotMatch(markup, /var\(--primary\)|<img|<title/)
})

test("creation avatar is decorative and cannot receive focus", () => {
  const markup = render()
  assert.match(markup, /aria-hidden="true"/)
  assert.match(markup, /focusable="false"/)
  assert.doesNotMatch(markup, /tabindex|role="img"/)
})

test("server page replaces only its header logo and loads upstream motion CSS", () => {
  const page = readFileSync(new URL("../app/[locale]/(app)/page.tsx", import.meta.url), "utf8")
  assert.match(page, /<NewGameAvatar\s*\/>/)
  assert.doesNotMatch(page, /next\/image|\/logo\.svg|["']use client["']/)
  assert.match(page, /import "blobatar\/motion\.css"/)
  assert.match(page, /import "blobatar\/gaze\.css"/)
  assert.match(page, /await requireSession\(\)/)
  assert.match(page, /getTranslations\("Home"\)/)
  assert.match(page, /<NewGameComposer\s*\/>/)
})

// SSR cannot run effects or pointer events: this checks wiring, not browser motion.
test("client boundary delegates pointer feedback to the official gaze hook", () => {
  const source = readFileSync(new URL("./new-game-avatar.tsx", import.meta.url), "utf8")
  assert.match(source, /^"use client"/)
  assert.match(source, /from "@blobatar\/react\/gaze"/)
  assert.match(source, /useGaze\(\{ travel: 10, lookAt: "pointer" \}\)/)
  assert.match(source, /ref=\{ref\}/)
  assert.match(source, /animate="always"/)
  assert.match(source, /name="alain00"/)
})
