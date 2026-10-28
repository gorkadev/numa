import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { getTemplate, isTemplateId } from "./catalog"
import { readTemplateAssetLock, readTemplateContract, readTemplateSeed } from "./seed"

test("Platformer registers a validated immutable seed", async () => {
  assert.ok(isTemplateId("platformer"))
  assert.equal(getTemplate("platformer").version, 1)
  const contract = await readTemplateContract("platformer", 1)
  assert.ok(contract)
  assert.equal(contract.manifest.models.length, 109)
  assert.equal(contract.manifest.licenseEvidence?.license, "CC0-1.0")
  assert.ok(contract.descriptor.includes("platformer@1"))
  await assert.rejects(readTemplateSeed("platformer", 2), /Unknown game template seed/)
  for (const locale of readdirSync("messages").filter((file) => file.endsWith(".json"))) {
    const messages = JSON.parse(readFileSync(path.join("messages", locale), "utf8"))
    assert.ok(messages.GameComposer.templates.platformer.label, locale)
    assert.ok(messages.GameComposer.templates.platformer.tagline, locale)
  }
})

test("Platformer does not impose a game-shape verification contract", async () => {
  const contract = await readTemplateContract("platformer", 1)
  assert.equal(contract?.manifest.verification, undefined)
})

test("every Platformer model declares its category and bounds", async () => {
  const contract = await readTemplateContract("platformer", 1)
  assert.ok(contract)
  for (const model of contract.manifest.models) {
    assert.ok(model.category, model.id)
    assert.ok(model.bounds, model.id)
  }
  const groups: Record<string, number> = {}
  for (const model of contract.manifest.models) groups[model.category!] = (groups[model.category!] ?? 0) + 1
  assert.deepEqual(groups, { enemy: 4, hazard: 8, mechanism: 9, pickup: 11, platform: 43, player: 2, prop: 23, structure: 1, vegetation: 8 })
})

test("the descriptor teaches what the files cannot", async () => {
  const contract = await readTemplateContract("platformer", 1)
  assert.ok(contract)
  for (const fact of ["2-unit grid", "SkeletonUtils.clone", "+Z", "Cube_Grass_1x1End", "no physics", "Stairs.gltf", "side-scroller"]) {
    assert.ok(contract.descriptor.includes(fact), fact)
  }
})

test("Platformer locks every declared file and nothing undeclared", async () => {
  const [lock, contract] = await Promise.all([readTemplateAssetLock("platformer", 1), readTemplateContract("platformer", 1)])
  assert.ok(lock && contract)
  const { models, licenseEvidence } = contract.manifest
  const declared = [...models.flatMap((model) => [model.path, model.bufferPath]), licenseEvidence?.path]
    .filter((file): file is string => Boolean(file))
    .sort()
  assert.deepEqual(Object.keys(lock.files).sort(), declared)
  assert.equal(declared.length, 111)
})

// Portable source-fidelity receipt over the lock. Provisioning rejects any blob
// whose SHA-256 differs from its entry, so this pins the approved bytes.
test("Platformer asset lock matches the approved source pack", async () => {
  const lock = await readTemplateAssetLock("platformer", 1)
  assert.ok(lock)
  const entries = Object.entries(lock.files).sort(([a], [b]) => a < b ? -1 : 1)
  assert.equal(entries.reduce((sum, [, entry]) => sum + entry.size, 0), 6277011)
  const hash = createHash("sha256")
  for (const [relativePath, entry] of entries) hash.update(`${relativePath}\0${entry.sha256}\n`)
  assert.equal(hash.digest("hex"), "290d53c318b53f1597f1ca2933e504f86d412875747cf0f007291db92d057e79")
})
