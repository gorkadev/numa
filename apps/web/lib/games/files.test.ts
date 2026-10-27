import assert from "node:assert/strict"
import test from "node:test"

import {
  buildFileTree,
  contentCacheControl,
  fileContentUrl,
  fileViewOf,
  filterFileTree,
  findFile,
  isPrefetchableText,
  MAX_VIEW_BYTES,
  previewAssetUrl,
} from "./files"

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

test("fileViewOf opens glTF models, binary or JSON, in the 3D viewer", () => {
  assert.deepEqual(fileViewOf("ship.glb"), { kind: "model" })
  assert.deepEqual(fileViewOf("assets/cards/12_Mimic.GLTF"), { kind: "model" })
})

test("fileViewOf treats a model's buffers, other model formats, fonts and archives as binary", () => {
  assert.deepEqual(fileViewOf("12_Mimic.bin"), { kind: "binary" })
  assert.deepEqual(fileViewOf("ship.fbx"), { kind: "binary" })
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

test("fileContentUrl names the file and the version it was read at", () => {
  assert.equal(
    fileContentUrl("g1", "assets/level 1.json", 1700000000000),
    "/api/games/g1/files/content?path=assets%2Flevel+1.json&v=1700000000000"
  )
})

test("contentCacheControl caches a versioned read for good and nothing else", () => {
  assert.equal(contentCacheControl("1700000000000"), "private, max-age=31536000, immutable")
  assert.equal(contentCacheControl(null), "no-store, private")
  assert.equal(contentCacheControl(""), "no-store, private")
})

test("isPrefetchableText accepts text files within the view limit only", () => {
  assert.equal(isPrefetchableText({ path: "main.js", size: 10 }), true)
  assert.equal(isPrefetchableText({ path: "main.js", size: MAX_VIEW_BYTES + 1 }), false)
  assert.equal(isPrefetchableText({ path: "hero.png", size: 10 }), false)
  assert.equal(isPrefetchableText({ path: "ship.glb", size: 10 }), false)
})

test("filterFileTree keeps matching files and the folders leading to them", () => {
  const tree = buildFileTree([
    { path: "index.html", type: "file", size: 1 },
    { path: "game.js", type: "file", size: 1 },
    { path: "engine/game-loop.js", type: "file", size: 1 },
    { path: "engine/physics.js", type: "file", size: 1 },
    { path: "assets/models/Tree.gltf", type: "file", size: 1 },
  ])

  const names = (nodes: ReturnType<typeof buildFileTree>): unknown[] =>
    nodes.map((node) => (node.type === "file" ? node.name : { [node.name]: names(node.children) }))

  assert.deepEqual(names(filterFileTree(tree, "GAME")), [{ engine: ["game-loop.js"] }, "game.js"])
  assert.deepEqual(names(filterFileTree(tree, "models/tr")), [{ assets: [{ models: ["Tree.gltf"] }] }])
  assert.deepEqual(filterFileTree(tree, "nothing-like-this"), [])
  assert.equal(filterFileTree(tree, ""), tree)
})
