import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../messages/en.json"
import { ChatPreviewBody } from "./chat-preview"

Object.assign(globalThis, { React })

function render(props: Partial<React.ComponentProps<typeof ChatPreviewBody>>) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <ChatPreviewBody gameId="g1" previewToken="tok" revision={0} reloadKey={0} {...props} />
    </NextIntlClientProvider>
  )
}

test("a gated preview waits for the player to press play", () => {
  const html = render({ startGate: true })

  assert.match(html, />Play<\/button>/)
  assert.match(html, /Ready to play/)
  assert.doesNotMatch(html, /Starting preview/)
  assert.doesNotMatch(html, /<iframe/)
})

test("an ungated preview starts on its own, as before", () => {
  const html = render({})

  assert.match(html, /Starting preview/)
  assert.doesNotMatch(html, /Ready to play/)
})
