import assert from "node:assert/strict"
import test from "node:test"

import { pngSize, spriteSheetProblems } from "./sprite-sheets"

/** The 24 bytes a PNG reader needs: signature, IHDR length and type, width, height. */
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write("IHDR", 12, "ascii")
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  return header
}

test("pngSize reads the IHDR dimensions and rejects anything that is not a PNG", () => {
  assert.deepEqual(pngSize(png(1536, 256)), { width: 1536, height: 256 })
  assert.equal(pngSize(Buffer.from("GIF89a")), undefined)
})

test("sprite sheets and tilesets must match their declared frame and tile grid", () => {
  const files = new Map([
    ["a/tree.png", png(1536, 256)],
    ["a/warrior.png", png(1536, 192)],
    ["a/tiles.png", png(576, 384)],
    ["a/castle.png", png(320, 256)],
  ])
  const ok = {
    sprites: [
      { id: "tree", path: "a/tree.png", frameWidth: 192, frameHeight: 256, frames: 8 },
      { id: "warrior", path: "a/warrior.png", frameWidth: 192, frameHeight: 192, frames: 8 },
      { id: "castle", path: "a/castle.png", frameWidth: 320, frameHeight: 256, frames: 1 },
    ],
    tilesets: [{ id: "tiles", path: "a/tiles.png", tileSize: 64, columns: 9, rows: 6 }],
  }
  assert.deepEqual(spriteSheetProblems(ok, files), [])

  const wrong = {
    sprites: [
      { id: "tree", path: "a/tree.png", frameWidth: 256, frameHeight: 256, frames: 6 },
      { id: "warrior", path: "a/warrior.png", frameWidth: 192, frameHeight: 192, frames: 9 },
      { id: "castle", path: "a/missing.png", frameWidth: 320, frameHeight: 256, frames: 1 },
    ],
    tilesets: [{ id: "tiles", path: "a/tiles.png", tileSize: 64, columns: 8, rows: 6 }],
  }
  assert.deepEqual(spriteSheetProblems(wrong, files), [
    "sprite warrior: a 1536x192 sheet holds 8 frames of 192x192, not 9",
    "sprite castle: missing a/missing.png",
    "tileset tiles: a 576x384 atlas is 9x6 tiles of 64, not 8x6",
  ])
})
