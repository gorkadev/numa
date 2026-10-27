import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import en from "../../messages/en.json"
import { FilesLayout, FilesTabBody } from "./files-tab"

Object.assign(globalThis, { React })

test("FilesTabBody starts the sandbox before showing the tree", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <FilesTabBody
        gameId="g1"
        previewToken="tok"
        version={0}
        selectedPath={null}
        onSelectPath={() => {}}
      />
    </NextIntlClientProvider>
  )

  assert.match(html, /Starting the sandbox/)
})

test("FilesLayout mounts the open file once for both layouts", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <FilesLayout tree={<span>TREE</span>} detail={<span>DETAIL</span>} fileOpen onBack={() => {}} />
    </NextIntlClientProvider>
  )

  assert.equal(html.match(/DETAIL/g)?.length, 1)
  assert.equal(html.match(/TREE/g)?.length, 1)
  assert.match(html, /Back to files/)
})
