import assert from "node:assert/strict"
import test from "node:test"

import {
  ATTACHMENT_MAX_BYTES,
  attachmentIdFromUrl,
  attachmentKey,
  attachmentMediaType,
  attachmentProblem,
  attachmentSrc,
  attachmentUrl,
  parseAttachmentParts,
} from "./attachments"

const id = "3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b"

test("a known type is kept, an empty type falls back to the extension, anything else is refused", () => {
  assert.equal(attachmentMediaType({ type: "image/png", name: "shot.png" }), "image/png")
  assert.equal(attachmentMediaType({ type: "", name: "NOTES.MD" }), "text/markdown")
  assert.equal(attachmentMediaType({ type: "application/octet-stream", name: "notes.md" }), "text/markdown")
  assert.equal(attachmentMediaType({ type: "application/octet-stream", name: "a.bin" }), null)
  assert.equal(attachmentMediaType({ type: "text/html", name: "page.png" }), null)
  assert.equal(attachmentMediaType({ type: "image/svg+xml", name: "logo.svg" }), null)
  assert.equal(attachmentMediaType({ type: "", name: "archive.zip" }), null)
})

test("a file is refused for its type, for being empty, or for exceeding the size limit", () => {
  assert.equal(attachmentProblem({ type: "application/zip", name: "a.zip", size: 10 }), "type")
  assert.equal(attachmentProblem({ type: "image/png", name: "a.png", size: 0 }), "empty")
  assert.equal(attachmentProblem({ type: "image/png", name: "a.png", size: ATTACHMENT_MAX_BYTES + 1 }), "size")
  assert.equal(attachmentProblem({ type: "image/png", name: "a.png", size: ATTACHMENT_MAX_BYTES }), null)
})

test("the key is scoped to its owner and the URL round-trips to the id", () => {
  assert.equal(attachmentKey("user-1", id), `users/user-1/${id}`)
  assert.equal(attachmentIdFromUrl(attachmentUrl(id)), id)
})

test("only our own attachment URLs yield an id, and the browser reads them from the read route", () => {
  assert.equal(attachmentIdFromUrl("https://evil.example/" + id), null)
  assert.equal(attachmentIdFromUrl("attachment:../users/other/" + id), null)
  assert.equal(attachmentIdFromUrl("data:image/png;base64,AAAA"), null)
  assert.equal(attachmentIdFromUrl(`attachment:${id}?x=1`), null)
  assert.equal(attachmentSrc(attachmentUrl(id)), `/api/attachments/${id}`)
  assert.equal(attachmentSrc("https://evil.example/a.png"), null)
  assert.doesNotThrow(() => new URL(attachmentUrl(id)))
})

test("attachment references from the browser keep only well-formed ones of ours, at most five", () => {
  const ok = { type: "file", url: attachmentUrl(id), mediaType: "image/png", filename: "a.png" }
  assert.deepEqual(parseAttachmentParts(JSON.stringify([ok])), [ok])
  assert.deepEqual(parseAttachmentParts("not json"), [])
  assert.deepEqual(parseAttachmentParts(JSON.stringify({ ...ok })), [])
  assert.deepEqual(
    parseAttachmentParts(
      JSON.stringify([
        { ...ok, url: "https://evil.example/a.png" },
        { ...ok, mediaType: "text/html" },
        { ...ok, filename: 7 },
      ])
    ),
    []
  )
  assert.equal(parseAttachmentParts(JSON.stringify(Array(7).fill(ok))).length, 5)
})
