import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../messages/en.json"
import { ChatComposer } from "./chat-composer"
import type { TemplateId } from "@/lib/games/templates/catalog"

// The installed tsx runner uses classic JSX for source files outside Next.
Object.assign(globalThis, { React })

function render(props: {
  templateId?: TemplateId
  onTemplateChange?: (templateId: TemplateId) => void
  attachable?: boolean
}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <ChatComposer value="" onValueChange={() => {}} onSubmit={() => {}} {...props} />
    </NextIntlClientProvider>
  )
}

test("an existing game's composer shows its template without offering a choice", () => {
  const html = render({ templateId: "cube-world" })

  assert.match(html, /Cube World|cube world/i)
  assert.match(html, /data-slot="locked-template"/)
  assert.doesNotMatch(html, /aria-keyshortcuts="Control\+Shift\+V"/)
})

test("a game without a template shows no template in its composer", () => {
  const html = render({ templateId: "none" })

  assert.doesNotMatch(html, /data-slot="locked-template"/)
  assert.doesNotMatch(html, /No template/)
})

test("the new-game composer still offers the template picker", () => {
  const html = render({ templateId: "none", onTemplateChange: () => {} })

  assert.match(html, /aria-keyshortcuts="Control\+Shift\+V"/)
  assert.doesNotMatch(html, /data-slot="locked-template"/)
})

test("before the editor mounts, its place holds the old text area's resting height", () => {
  const html = render({})

  assert.match(html, /data-slot="composer-editor" class="[^"]*\bmin-h-16\b/)
  assert.doesNotMatch(html, /<textarea/)
})

test("an attachable composer offers a + button over a hidden file input of the types we take", () => {
  const html = render({ attachable: true })

  assert.match(html, /aria-label="Attach files"/)
  assert.match(html, /<input[^>]*type="file"[^>]*multiple[^>]*accept="[^"]*image\/png[^"]*application\/pdf/)
})

test("a composer without attachments shows no attach button and no file input", () => {
  const html = render({})

  assert.doesNotMatch(html, /Attach files/)
  assert.doesNotMatch(html, /type="file"/)
})
