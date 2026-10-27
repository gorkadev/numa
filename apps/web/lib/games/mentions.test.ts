import assert from "node:assert/strict"
import test from "node:test"

import type { FileTreeNode } from "./files"
import { activeMention, insertMention, mentionFiles, rankMentions } from "./mentions"

test("an @ at the start or after whitespace opens a mention with the text typed after it", () => {
  assert.deepEqual(activeMention("@gu", 3), { start: 0, query: "gu" })
  assert.deepEqual(activeMention("Usa @gun", 8), { start: 4, query: "gun" })
  assert.deepEqual(activeMention("Usa @", 5), { start: 4, query: "" })
  assert.deepEqual(activeMention("a\n@src/ma", 9), { start: 2, query: "src/ma" })
})

test("an @ inside a word, a finished mention, or a caret before the @ opens nothing", () => {
  assert.equal(activeMention("me@mail.com", 11), null)
  assert.equal(activeMention("Usa @gun ahora", 14), null)
  assert.equal(activeMention("Usa @gun", 3), null)
  assert.equal(activeMention("", 0), null)
})

test("only the text up to the caret counts as the query", () => {
  assert.deepEqual(activeMention("Usa @gun", 6), { start: 4, query: "g" })
})

test("the file list is every file in the tree, folders left out", () => {
  const tree: FileTreeNode[] = [
    {
      type: "folder",
      name: "assets",
      path: "assets",
      children: [{ type: "file", name: "gun.glb", path: "assets/gun.glb", size: 1 }],
    },
    { type: "file", name: "index.html", path: "index.html", size: 1 },
  ]

  assert.deepEqual(mentionFiles(tree), ["assets/gun.glb", "index.html"])
})

test("matches rank by file name first, then anywhere in the path, case-insensitively", () => {
  const paths = ["src/weapons/shotgun.ts", "docs/gun-notes.md", "assets/Gun.glb", "src/main.ts", "gunner/a.ts"]

  assert.deepEqual(rankMentions(paths, "gun"), [
    "assets/Gun.glb",
    "docs/gun-notes.md",
    "src/weapons/shotgun.ts",
    "gunner/a.ts",
  ])
  assert.deepEqual(rankMentions(paths, "weapons/s"), ["src/weapons/shotgun.ts"])
  assert.deepEqual(rankMentions(paths, "zzz"), [])
})

test("every match is listed, with no cap, and an empty query lists every file in order", () => {
  const paths = Array.from({ length: 40 }, (_, i) => `models/m${i}.gltf`)

  assert.equal(rankMentions(paths, "gltf").length, 40)
  assert.deepEqual(rankMentions(paths, ""), paths)
})

test("choosing a file replaces the typed mention with its full path and leaves the caret after one space", () => {
  assert.deepEqual(insertMention("Usa @gu como arma", { start: 4, query: "gu" }, "assets/gun.glb"), {
    value: "Usa @assets/gun.glb como arma",
    caret: 20,
  })
  assert.deepEqual(insertMention("@", { start: 0, query: "" }, "index.html"), {
    value: "@index.html ",
    caret: 12,
  })
})
