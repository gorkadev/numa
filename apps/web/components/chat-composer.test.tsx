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
