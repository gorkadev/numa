import assert from "node:assert/strict"
import test from "node:test"

import type { FileTreeNode } from "./files"
import { mentionFiles, rankMentions } from "./mentions"

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
