import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { MessageAttachments } from "./message-attachments"

// The installed tsx runner uses classic JSX for source files outside Next.
Object.assign(globalThis, { React })

const id = "3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b"

test("an image attachment shows a lazy thumbnail from the read route; other URLs show nothing", () => {
  const html = renderToStaticMarkup(
    <MessageAttachments
      parts={[
        { type: "file", url: `attachment:${id}`, mediaType: "image/png", filename: "boceto.png" },
        { type: "file", url: "https://evil.example/a.png", mediaType: "image/png", filename: "evil.png" },
      ]}
    />
  )

  assert.match(html, new RegExp(`<img src="/api/attachments/${id}"[^>]*loading="lazy"`))
  assert.match(html, /boceto\.png/)
  assert.doesNotMatch(html, /evil/)
})

test("a message with no attachments of ours renders nothing", () => {
  assert.equal(renderToStaticMarkup(<MessageAttachments parts={[]} />), "")
})
