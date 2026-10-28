import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { getTemplate, isTemplateId } from "./catalog"
import { readTemplateAssetLock, readTemplateContract, readTemplateSeed } from "./seed"

test("Tiny Swords registers a validated immutable 2D seed", async () => {
  assert.ok(isTemplateId("tiny-swords"))
  assert.equal(getTemplate("tiny-swords").version, 1)
  const contract = await readTemplateContract("tiny-swords", 1)
  assert.ok(contract)
  assert.equal(contract.manifest.models.length, 0)
  assert.equal(contract.manifest.sprites?.length, 398)
  assert.equal(contract.manifest.tilesets?.length, 5)
  assert.match(contract.manifest.licenseEvidence?.license ?? "", /no asset redistribution/)
  assert.ok(contract.descriptor.includes("tiny-swords@1"))
  await assert.rejects(readTemplateSeed("tiny-swords", 2), /Unknown game template seed/)
  for (const locale of readdirSync("messages").filter((file) => file.endsWith(".json"))) {
    const messages = JSON.parse(readFileSync(path.join("messages", locale), "utf8"))
    assert.ok(messages.GameComposer.templates["tiny-swords"].label, locale)
    assert.ok(messages.GameComposer.templates["tiny-swords"].tagline, locale)
  }
})

test("Tiny Swords does not impose a game-shape verification contract", async () => {
  const contract = await readTemplateContract("tiny-swords", 1)
  assert.equal(contract?.manifest.verification, undefined)
})

test("Tiny Swords frame sizes are the verified ones, not the image height", async () => {
  const contract = await readTemplateContract("tiny-swords", 1)
  const byId = new Map(contract?.manifest.sprites?.map((sprite) => [sprite.id, sprite]))
  const frame = (id: string) => {
    const sprite = byId.get(id)
    return sprite && [sprite.frameWidth, sprite.frameHeight, sprite.frames, sprite.loop ?? true]
  }
  assert.deepEqual(frame("resources-tree-1"), [192, 256, 8, true])
  assert.deepEqual(frame("units-red-warrior-attack1"), [192, 192, 4, false])
  assert.deepEqual(frame("units-black-lancer-idle"), [320, 320, 12, true])
  assert.deepEqual(frame("terrain-water-foam"), [192, 192, 16, true])
  assert.deepEqual(frame("terrain-shadow"), [192, 192, 1, true])
  assert.deepEqual(frame("decorations-water-rock-4"), [64, 64, 16, true])
  assert.deepEqual(frame("ui-big-ribbons"), [320, 128, 5, true])
})

test("every terrain tileset shares the verified tile names", async () => {
  const contract = await readTemplateContract("tiny-swords", 1)
  assert.ok(contract)
  for (const tileset of contract.manifest.tilesets ?? []) {
    const tiles = tileset.tiles ?? {}
    assert.equal(Object.keys(tiles).length, 44, tileset.id)
    assert.deepEqual(
      [tiles["flat.top-left"], tiles["flat.single"], tiles["elevated.top-left"], tiles["elevated.single"], tiles["cliff.left"], tiles["cliff-water.single"], tiles["stairs-left.top"], tiles["stairs-right.bottom"]],
      [0, 30, 5, 35, 41, 53, 36, 48],
      tileset.id
    )
  }
})

test("the descriptor teaches what the files cannot", async () => {
  const contract = await readTemplateContract("tiny-swords", 1)
  assert.ok(contract)
  for (const fact of ["engine-2d", "pixelsPerUnit: 64", "192x256", "autotile16", "one cell *below*", "Never replace the tiles under the stairs", "[0.5, 0.29]", "border-image", "flipX"]) {
    assert.ok(contract.descriptor.includes(fact), fact)
  }
})

test("Tiny Swords locks every declared file and nothing undeclared", async () => {
  const [lock, contract] = await Promise.all([readTemplateAssetLock("tiny-swords", 1), readTemplateContract("tiny-swords", 1)])
  assert.ok(lock && contract)
  const { sprites = [], tilesets = [], licenseEvidence } = contract.manifest
  const declared = [...sprites.map((sprite) => sprite.path), ...tilesets.map((tileset) => tileset.path), licenseEvidence?.path]
    .filter((file): file is string => Boolean(file))
    .sort()
  assert.deepEqual(Object.keys(lock.files).sort(), declared)
  assert.equal(declared.length, 404)
})

// Portable source-fidelity receipt over the lock. Provisioning rejects any blob
// whose SHA-256 differs from its entry, so this pins the approved bytes.
test("Tiny Swords asset lock matches the approved source pack", async () => {
  const lock = await readTemplateAssetLock("tiny-swords", 1)
  assert.ok(lock)
  const entries = Object.entries(lock.files).sort(([a], [b]) => a < b ? -1 : 1)
  assert.equal(entries.reduce((sum, [, entry]) => sum + entry.size, 0), 2744157)
  const hash = createHash("sha256")
  for (const [relativePath, entry] of entries) hash.update(`${relativePath}\0${entry.sha256}\n`)
  assert.equal(hash.digest("hex"), "0a0aa4613204dff03e07462b1eede82dc8793fbf22f10ae95fe2e4907cc02d43")
})
