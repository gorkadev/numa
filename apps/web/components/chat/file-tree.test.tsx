import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { FileTreeNode } from "../../lib/games/files"
import { FileTree } from "./file-tree"

Object.assign(globalThis, { React })

const nodes: FileTreeNode[] = [
  {
    type: "folder",
    name: "assets",
    path: "assets",
    children: [
      {
        type: "folder",
        name: "audio",
        path: "assets/audio",
        children: [{ type: "file", name: "jump.wav", path: "assets/audio/jump.wav", size: 1 }],
      },
      { type: "file", name: "hero.png", path: "assets/hero.png", size: 2 },
    ],
  },
  { type: "file", name: "index.html", path: "index.html", size: 3 },
]

test("FileTree renders folders as collapsibles and files as buttons", () => {
  const html = renderToStaticMarkup(
    <FileTree nodes={nodes} selectedPath={null} onSelect={() => {}} />
  )

  assert.match(html, /data-slot="collapsible-trigger"[^>]*>.*assets/)
  assert.match(html, /<button[^>]*>.*index\.html/)
  assert.doesNotMatch(html, /aria-current/)
})

test("FileTree marks the selected file and opens the folders that hold it", () => {
  const html = renderToStaticMarkup(
    <FileTree nodes={nodes} selectedPath="assets/audio/jump.wav" onSelect={() => {}} />
  )

  assert.match(html, /aria-current="true"[^>]*>.*jump\.wav/)
  assert.equal(html.match(/aria-expanded="true"/g)?.length, 2)
})

test("FileTree keeps nested folders closed by default", () => {
  const html = renderToStaticMarkup(
    <FileTree nodes={nodes} selectedPath={null} onSelect={() => {}} />
  )

  assert.equal(html.match(/aria-expanded="true"/g)?.length, 1)
  assert.doesNotMatch(html, /jump\.wav/)
})
