import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import { UsageFooter } from "./usage-footer"

Object.assign(globalThis, { React })

function render(showSessionStats: boolean) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <UsageFooter
        usage={null}
        speed={null}
        activity={{ turns: 3, steps: 12 }}
        timing={null}
        context={{ tokens: 1000, window: 100000 }}
        showSessionStats={showSessionStats}
      />
    </NextIntlClientProvider>
  )
}

test("the footer shows session statistics unless the player hid them", () => {
  assert.match(render(true), /steps/)
  assert.doesNotMatch(render(false), /steps/)
})

test("hiding session statistics keeps token usage and the context ring", () => {
  const shown = render(true)
  const hidden = render(false)

  assert.equal(
    (hidden.match(/<button/g) ?? []).length,
    (shown.match(/<button/g) ?? []).length - 1
  )
})
