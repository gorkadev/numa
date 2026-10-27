import assert from "node:assert/strict"
import test from "node:test"

import { DaytonaFileNotFoundError } from "@daytona/sdk"

import { GAME_DIR } from "@/lib/games/game-path"

import {
  FILE_TREE_DEPTH,
  listGameFiles,
  readGameTextFile,
  type GameFs,
} from "./files-server"
import { MAX_VIEW_BYTES } from "./files"

type FakeFile = { content?: Buffer; isDir?: boolean }

function fakeFs(files: Record<string, FakeFile>): GameFs & { listed: unknown[] } {
  const listed: unknown[] = []

  return {
    listed,
    async listFiles(path, options) {
      listed.push({ path, options })
      return Object.entries(files).map(([relative, file]) => ({
        name: relative.slice(relative.lastIndexOf("/") + 1),
        path: `${GAME_DIR}/${relative}`,
        isDir: Boolean(file.isDir),
        size: file.content?.length ?? 0,
      }))
    },
    async downloadFile(path) {
      const file = files[path.slice(GAME_DIR.length + 1)]
      if (!file?.content) throw new DaytonaFileNotFoundError("missing")
      return file.content
    },
  }
}

test("listGameFiles lists the whole game directory relative to it", async () => {
  const fs = fakeFs({
    assets: { isDir: true },
    "assets/hero.png": { content: Buffer.from("png") },
    "index.html": { content: Buffer.from("<html>") },
  })

  assert.deepEqual(await listGameFiles(fs), [
    { path: "assets", type: "directory" },
    { path: "assets/hero.png", type: "file", size: 3 },
    { path: "index.html", type: "file", size: 6 },
  ])
  assert.deepEqual(fs.listed, [{ path: GAME_DIR, options: { depth: FILE_TREE_DEPTH } }])
})

test("readGameTextFile returns the content of a text file", async () => {
  const fs = fakeFs({ "main.js": { content: Buffer.from("const a = 1\n") } })

  assert.deepEqual(await readGameTextFile(fs, "main.js"), {
    ok: true,
    path: "main.js",
    content: "const a = 1\n",
  })
})

test("readGameTextFile refuses paths that leave the game directory", async () => {
  const fs = fakeFs({})

  assert.deepEqual(await readGameTextFile(fs, "../etc/passwd"), { ok: false, reason: "invalid_path" })
  assert.deepEqual(await readGameTextFile(fs, "/etc/passwd"), { ok: false, reason: "invalid_path" })
})

test("readGameTextFile reports a missing file", async () => {
  assert.deepEqual(await readGameTextFile(fakeFs({}), "nope.js"), { ok: false, reason: "not_found" })
})

test("readGameTextFile reads with a single download and refuses oversized content", async () => {
  const fs = fakeFs({ "big.txt": { content: Buffer.alloc(MAX_VIEW_BYTES + 1, "a") } })
  let downloads = 0
  const download = fs.downloadFile
  fs.downloadFile = async (path) => {
    downloads += 1
    return download(path)
  }

  assert.deepEqual(await readGameTextFile(fs, "big.txt"), {
    ok: false,
    reason: "too_large",
    size: MAX_VIEW_BYTES + 1,
  })
  assert.equal(downloads, 1)
  assert.deepEqual(Object.keys(fs).sort(), ["downloadFile", "listFiles", "listed"])
})

test("readGameTextFile refuses binary content", async () => {
  const fs = fakeFs({ "data.txt": { content: Buffer.from([0x61, 0x00, 0x62]) } })

  assert.deepEqual(await readGameTextFile(fs, "data.txt"), { ok: false, reason: "binary", size: 3 })
})
