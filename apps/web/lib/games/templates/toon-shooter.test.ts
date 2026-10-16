import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { getTemplate, isTemplateId } from "./catalog"
import { readGameSeed, readTemplateContract, readTemplateSeed } from "./seed"

test("licensed legacy kits have clean picker and planner-facing contracts", async () => {
  const obsoleteWarning = /license[- ]risk|missing.local.evidence|no bundled|absent.license|unknown.license|no incluye documentación|with this risk/i
  for (const id of ["cube-world", "toon-shooter"] as const) {
    const contract = await readTemplateContract(id, 1)
    assert.ok(contract)
    // context.ts emits its optional planner warning only when this record exists.
    assert.equal(contract.manifest.licenseRisk, undefined, id)
    assert.equal(contract.manifest.licenseEvidence, undefined, "do not invent license evidence")
    assert.doesNotMatch(contract.descriptor, obsoleteWarning)
    assert.doesNotMatch(getTemplate(id).tagline, obsoleteWarning)
    for (const locale of ["en", "es"]) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"))
      assert.doesNotMatch(messages.GameComposer.templates[id].tagline, obsoleteWarning)
    }
  }
})

test("Toon Shooter registers a validated immutable seed", async () => {
  assert.ok(isTemplateId("toon-shooter"))
  assert.equal(getTemplate("toon-shooter").version, 1)
  const contract = await readTemplateContract("toon-shooter", 1)
  assert.ok(contract)
  assert.equal(contract.manifest.models.length, 74)
  assert.equal(contract.manifest.licenseEvidence, undefined)
  assert.equal(contract.manifest.licenseRisk, undefined)
  assert.ok(contract.descriptor.includes("toon-shooter@1"))
  await assert.rejects(readTemplateSeed("toon-shooter", 2), /Unknown game template seed/)
  for (const locale of readdirSync("messages").filter((file) => file.endsWith(".json"))) {
    const messages = JSON.parse(readFileSync(path.join("messages", locale), "utf8"))
    assert.ok(messages.GameComposer.templates["toon-shooter"].label)
    assert.ok(messages.GameComposer.templates["toon-shooter"].tagline)
  }
})

test("Toon Shooter declares every seeded model and its complete local dependency closure", async () => {
  const seed = await readGameSeed("toon-shooter", 1)
  const contract = await readTemplateContract("toon-shooter", 1)
  assert.ok(contract)
  const { models, sharedAssets = [] } = contract.manifest
  const files = new Map(seed.files.map(({ relativePath, contents }) => [relativePath, contents]))
  const modelPaths = models.map((model) => model.path).sort()
  assert.deepEqual([...files.keys()].filter((file) => file.startsWith("assets/toon-shooter/") && file.endsWith(".gltf")).sort(), modelPaths)
  assert.equal(new Set(models.map((model) => model.id)).size, 74)
  const declared = new Set([...modelPaths, ...sharedAssets.map((asset) => asset.path), ...models.flatMap((model) => [model.bufferPath, model.atlasPath]).filter(Boolean)])
  const groups: Record<string, number> = {}
  for (const model of models) {
    groups[model.path.split("/")[2]!] = (groups[model.path.split("/")[2]!] ?? 0) + 1
    const gltf = JSON.parse(files.get(model.path)!.toString("utf8"))
    assert.deepEqual((model.animations ?? []).map((clip) => clip.name).sort(), (gltf.animations ?? []).map((clip: { name: string }) => clip.name).sort())
    for (const entry of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
      if (!entry.uri || entry.uri.startsWith("data:")) continue
      assert.ok(!/^[a-z]+:/i.test(entry.uri), "no remote dependencies")
      const dependency = path.posix.join(path.posix.dirname(model.path), decodeURIComponent(entry.uri))
      assert.ok(files.has(dependency), dependency)
      assert.ok(declared.has(dependency), dependency)
    }
  }
  assert.deepEqual(groups, { Characters: 3, Environment: 55, Guns: 16 })
  assert.ok([...files.keys()].filter((file) => file.startsWith("assets/toon-shooter/")).every((file) => declared.has(file)))
})

// Portable source-fidelity receipt: no dependency on the author's Downloads folder.
test("Toon Shooter asset bytes match the approved complete source pack", async () => {
  const seed = await readTemplateSeed("toon-shooter", 1)
  const assets = seed.files.filter((file) => file.relativePath.startsWith("assets/toon-shooter/"))
  assert.equal(assets.length, 74)
  assert.equal(assets.reduce((sum, file) => sum + file.contents.length, 0), 11894462)
  const hash = createHash("sha256")
  for (const file of assets.sort((a, b) => a.relativePath < b.relativePath ? -1 : 1)) {
    hash.update(file.relativePath).update("\0").update(file.contents)
  }
  assert.equal(hash.digest("hex"), "b5206dc08183c88f4443863cce3672523b397d65266bf3bf91c941360836925c")
})
