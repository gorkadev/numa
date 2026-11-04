import assert from "node:assert/strict"
import test from "node:test"

import {
  encodeLibraryCursor,
  libraryKind,
  libraryPage,
  parseLibraryCursor,
  parseLibraryTab,
} from "./library"

const id = "3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b"
const at = new Date("2026-11-04T10:20:30.456Z")

test("images are images, everything else is a document", () => {
  assert.equal(libraryKind("image/webp"), "image")
  assert.equal(libraryKind("application/pdf"), "document")
  assert.equal(libraryKind("application/json"), "document")
})

test("a tab parameter is one of the three tabs, anything else is all", () => {
  assert.equal(parseLibraryTab("image"), "image")
  assert.equal(parseLibraryTab("document"), "document")
  assert.equal(parseLibraryTab("all"), "all")
  assert.equal(parseLibraryTab(null), "all")
  assert.equal(parseLibraryTab("video"), "all")
})

test("a cursor round-trips the last row's date and id", () => {
  const cursor = encodeLibraryCursor({ createdAt: at, id })
  assert.deepEqual(parseLibraryCursor(cursor), { createdAt: at, id })
})

test("no cursor is the first page, and a malformed one is refused", () => {
  assert.equal(parseLibraryCursor(null), undefined)
  assert.equal(parseLibraryCursor(""), undefined)
  assert.equal(parseLibraryCursor("garbage"), null)
  assert.equal(parseLibraryCursor(`not-a-date~${id}`), null)
  assert.equal(parseLibraryCursor(`${at.toISOString()}~not-an-id`), null)
})

test("a page keeps the limit, and names the next cursor only when a row was left over", () => {
  const rows = [0, 1, 2].map((index) => ({
    id: `${index}0000000-0000-4000-8000-000000000000`,
    filename: `f${index}.txt`,
    mediaType: "text/plain",
    size: index,
    createdAt: new Date(at.getTime() - index * 1000),
  }))

  const full = libraryPage(rows, 2)
  assert.deepEqual(
    full.items.map((item) => item.filename),
    ["f0.txt", "f1.txt"]
  )
  assert.equal(full.items[0]!.createdAt, at.toISOString())
  assert.deepEqual(parseLibraryCursor(full.next), {
    createdAt: rows[1]!.createdAt,
    id: rows[1]!.id,
  })

  const last = libraryPage(rows.slice(0, 2), 2)
  assert.equal(last.items.length, 2)
  assert.equal(last.next, null)
})
