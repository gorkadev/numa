import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { getTemplate, isTemplateId } from "./catalog"
import { readTemplateAssetLock, readTemplateContract, readTemplateSeed } from "./seed"

test("Legacy Fantasy registers a validated immutable 2D seed", async () => {
  assert.ok(isTemplateId("legacy-fantasy"))
  const template = getTemplate("legacy-fantasy")
  assert.equal(template.version, 1)
  assert.equal(template.dimension, "2d")
  const contract = await readTemplateContract("legacy-fantasy", 1)
  assert.ok(contract)
  assert.equal(contract.manifest.models.length, 0)
  assert.equal(contract.manifest.sprites?.length, 271)
  assert.equal(contract.manifest.tilesets?.length, 1)
  assert.match(contract.manifest.licenseEvidence?.sourcePack ?? "", /Legacy-Fantasy - High Forest 2\.3/)
  assert.ok(contract.descriptor.includes("legacy-fantasy@1"))
  await assert.rejects(readTemplateSeed("legacy-fantasy", 2), /Unknown game template seed/)
  for (const locale of readdirSync("messages").filter((file) => file.endsWith(".json"))) {
    const messages = JSON.parse(readFileSync(path.join("messages", locale), "utf8"))
    assert.ok(messages.GameComposer.templates["legacy-fantasy"].label, locale)
    assert.ok(messages.GameComposer.templates["legacy-fantasy"].tagline, locale)
  }
})

test("Legacy Fantasy ships its own side-view starter page", async () => {
  const seed = await readTemplateSeed("legacy-fantasy", 1)
  const page = seed.files.find((file) => file.relativePath === "index.html")
  assert.ok(page)
  const html = page.contents.toString("utf8")
  assert.match(html, /"\.\/assets\/legacy-fantasy\/"/)
  assert.match(html, /"character\/idle\.png"/)
  assert.doesNotMatch(html, /tiny-swords/)
})

test("Legacy Fantasy frame sizes are the verified ones", async () => {
  const contract = await readTemplateContract("legacy-fantasy", 1)
  const byId = new Map(contract?.manifest.sprites?.map((sprite) => [sprite.id, sprite]))
  const frame = (id: string) => {
    const sprite = byId.get(id)
    return sprite && [sprite.frameWidth, sprite.frameHeight, sprite.frames, sprite.loop ?? true]
  }
  // Every hero animation shares one repacked frame, so one anchor fits all.
  for (const animation of ["idle", "run", "dead", "jump", "jump-start", "jump-air", "jump-end"]) {
    assert.deepEqual(frame(`character-${animation}`)?.slice(0, 2), [112, 80], animation)
  }
  assert.deepEqual(frame("character-idle"), [112, 80, 4, true])
  assert.deepEqual(frame("character-attack"), [112, 80, 8, false])
  assert.deepEqual(frame("character-jump"), [112, 80, 15, false])
  assert.deepEqual(frame("mobs-boar-walk"), [48, 32, 6, true])
  assert.deepEqual(frame("mobs-boar-black-hit"), [48, 32, 4, false])
  assert.deepEqual(frame("mobs-bee-fly"), [64, 64, 4, true])
  assert.deepEqual(frame("mobs-snail-hide"), [48, 32, 8, false])
  assert.deepEqual(frame("trees-green-tree-1"), [107, 368, 1, true])
  assert.deepEqual(frame("backgrounds-forest-strip-dark"), [96, 256, 1, true])
})

test("the terrain tileset names the grass and dirt block tiles", async () => {
  const contract = await readTemplateContract("legacy-fantasy", 1)
  const tileset = contract?.manifest.tilesets?.[0]
  assert.ok(tileset)
  assert.deepEqual([tileset.id, tileset.tileSize, tileset.columns, tileset.rows], ["terrain-tiles", 16, 25, 25])
  const tiles = tileset.tiles ?? {}
  assert.equal(Object.keys(tiles).length, 27)
  assert.deepEqual(
    [tiles["grass.tuft"], tiles["grass.top-left"], tiles["grass.top"], tiles["grass.top-right"], tiles["grass.center"], tiles["grass.bottom-right"], tiles["dirt.cap-left"], tiles["dirt.top"], tiles["dirt.bottom"]],
    [1, 25, 26, 29, 76, 104, 125, 151, 226]
  )
})

test("the descriptor teaches what the files cannot", async () => {
  const contract = await readTemplateContract("legacy-fantasy", 1)
  assert.ok(contract)
  for (const fact of ["engine-2d", "pixelsPerUnit: 16", "ySort: false", "[0.5, 0.2]", "−surfaceRow + 0.5", "112x80", "border-image", "flipX"]) {
    assert.ok(contract.descriptor.includes(fact), fact)
  }
})

test("Legacy Fantasy locks every declared file and nothing undeclared", async () => {
  const [lock, contract] = await Promise.all([readTemplateAssetLock("legacy-fantasy", 1), readTemplateContract("legacy-fantasy", 1)])
  assert.ok(lock && contract)
  const { sprites = [], tilesets = [], licenseEvidence } = contract.manifest
  const declared = [...sprites.map((sprite) => sprite.path), ...tilesets.map((tileset) => tileset.path), licenseEvidence?.path]
    .filter((file): file is string => Boolean(file))
    .sort()
  assert.deepEqual(Object.keys(lock.files).sort(), declared)
  assert.equal(declared.length, 273)
})

// Portable source-fidelity receipt over the lock. Provisioning rejects any blob
// whose SHA-256 differs from its entry, so this pins the approved bytes.
test("Legacy Fantasy asset lock matches the approved generated pack", async () => {
  const lock = await readTemplateAssetLock("legacy-fantasy", 1)
  assert.ok(lock)
  const entries = Object.entries(lock.files).sort(([a], [b]) => a < b ? -1 : 1)
  assert.equal(entries.reduce((sum, [, entry]) => sum + entry.size, 0), 513325)
  const hash = createHash("sha256")
  for (const [relativePath, entry] of entries) hash.update(`${relativePath}\0${entry.sha256}\n`)
  assert.equal(hash.digest("hex"), "66d638161642058305ce77b6db90f23e725c7f175e6dd1d600b47be1afb6711e")
})
