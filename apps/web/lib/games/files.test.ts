import assert from "node:assert/strict"
import test from "node:test"

import { buildFileTree, fileViewOf, findFile, previewAssetUrl } from "./files"

test("buildFileTree nests a flat listing, folders first and names sorted", () => {
  const tree = buildFileTree([
    { path: "main.js", type: "file", size: 10 },
    { path: "assets/hero.png", type: "file", size: 2048 },
    { path: "engine", type: "directory" },
    { path: "assets", type: "directory" },
    { path: "engine/core.js", type: "file", size: 5 },
    { path: "index.html", type: "file", size: 3 },
    { path: "assets/audio/jump.wav", type: "file", size: 1 },
  ])

  assert.deepEqual(tree, [
    {
      type: "folder",
      name: "assets",
      path: "assets",
      children: [
        {
          type: "folder",
          name: "audio",
          path: "assets/audio",
          children: [
            { type: "file", name: "jump.wav", path: "assets/audio/jump.wav", size: 1 },
          ],
        },
        { type: "file", name: "hero.png", path: "assets/hero.png", size: 2048 },
      ],
    },
    {
      type: "folder",
      name: "engine",
      path: "engine",
      children: [
        { type: "file", name: "core.js", path: "engine/core.js", size: 5 },
      ],
    },
    { type: "file", name: "index.html", path: "index.html", size: 3 },
    { type: "file", name: "main.js", path: "main.js", size: 10 },
  ])
})

test("buildFileTree creates folders the listing only implies", () => {
  assert.deepEqual(buildFileTree([{ path: "a/b.txt", type: "file", size: 1 }]), [
    {
      type: "folder",
      name: "a",
      path: "a",
      children: [{ type: "file", name: "b.txt", path: "a/b.txt", size: 1 }],
    },
  ])
})

test("fileViewOf maps code extensions to a highlighter language", () => {
  assert.deepEqual(fileViewOf("main.js"), { kind: "code", language: "javascript" })
  assert.deepEqual(fileViewOf("index.html"), { kind: "code", language: "html" })
  assert.deepEqual(fileViewOf("assets/level.json"), { kind: "code", language: "json" })
  assert.deepEqual(fileViewOf("style.CSS"), { kind: "code", language: "css" })
  assert.deepEqual(fileViewOf("README.md"), { kind: "code", language: "markdown" })
  assert.deepEqual(fileViewOf("notes.txt"), { kind: "code", language: "text" })
})

test("fileViewOf classifies media assets, keeping SVG as an image", () => {
  assert.deepEqual(fileViewOf("hero.png"), { kind: "image" })
  assert.deepEqual(fileViewOf("icon.svg"), { kind: "image" })
  assert.deepEqual(fileViewOf("jump.wav"), { kind: "audio" })
  assert.deepEqual(fileViewOf("music.ogg"), { kind: "audio" })
  assert.deepEqual(fileViewOf("intro.mp4"), { kind: "video" })
})

test("fileViewOf treats models, fonts and archives as binary", () => {
  assert.deepEqual(fileViewOf("ship.glb"), { kind: "binary" })
  assert.deepEqual(fileViewOf("font.woff2"), { kind: "binary" })
  assert.deepEqual(fileViewOf("bundle.zip"), { kind: "binary" })
})

test("fileViewOf opens anything else as plain text", () => {
  assert.deepEqual(fileViewOf("Makefile"), { kind: "code", language: "text" })
  assert.deepEqual(fileViewOf("shader.frag"), { kind: "code", language: "text" })
})

test("previewAssetUrl points at the preview proxy with each segment encoded", () => {
  assert.equal(
    previewAssetUrl("g1", "tok", "assets/my sprite#1.png", 3),
    "/api/games/g1/preview/tok/assets/my%20sprite%231.png?v=3"
  )
})

test("findFile returns the file node at a path, and nothing for folders or gaps", () => {
  const tree = buildFileTree([
    { path: "assets", type: "directory" },
    { path: "assets/hero.png", type: "file", size: 4 },
  ])

  assert.deepEqual(findFile(tree, "assets/hero.png"), {
    type: "file",
    name: "hero.png",
    path: "assets/hero.png",
    size: 4,
  })
  assert.equal(findFile(tree, "assets"), undefined)
  assert.equal(findFile(tree, "missing.js"), undefined)
})
