import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import { FilesTabBody } from "./files-tab"

Object.assign(globalThis, { React })

test("FilesTabBody starts the sandbox before showing the tree", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <FilesTabBody
        gameId="g1"
        previewToken="tok"
        revision={0}
        selectedPath={null}
        onSelectPath={() => {}}
      />
    </NextIntlClientProvider>
  )

  assert.match(html, /Starting the sandbox/)
})
