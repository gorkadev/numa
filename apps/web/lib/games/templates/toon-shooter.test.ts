import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { getTemplate, isTemplateId } from "./catalog"
import { readGameSeed, readTemplateAssetLock, readTemplateContract, readTemplateSeed } from "./seed"

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

test("Toon Shooter locks every declared model and nothing undeclared", async () => {
  const lock = await readTemplateAssetLock("toon-shooter", 1)
  const contract = await readTemplateContract("toon-shooter", 1)
  assert.ok(lock && contract)
  const { models, sharedAssets = [] } = contract.manifest
  const locked = Object.keys(lock.files)
  const modelPaths = models.map((model) => model.path).sort()
  assert.deepEqual(locked.filter((file) => file.endsWith(".gltf")).sort(), modelPaths)
  assert.equal(new Set(models.map((model) => model.id)).size, 74)
  const declared = new Set([...modelPaths, ...sharedAssets.map((asset) => asset.path), ...models.flatMap((model) => [model.bufferPath, model.atlasPath]).filter(Boolean)])
  const groups: Record<string, number> = {}
  for (const model of models) groups[model.path.split("/")[2]!] = (groups[model.path.split("/")[2]!] ?? 0) + 1
  assert.deepEqual(groups, { Characters: 3, Environment: 55, Guns: 16 })
  assert.ok(locked.every((file) => file.startsWith("assets/toon-shooter/") && declared.has(file)))
})

// Portable source-fidelity receipt over the lock. Provisioning rejects any blob
// whose SHA-256 differs from its entry, so this pins the approved bytes.
test("Toon Shooter asset lock matches the approved complete source pack", async () => {
  const lock = await readTemplateAssetLock("toon-shooter", 1)
  assert.ok(lock)
  const entries = Object.entries(lock.files).sort(([a], [b]) => a < b ? -1 : 1)
  assert.equal(entries.length, 74)
  assert.equal(entries.reduce((sum, [, entry]) => sum + entry.size, 0), 11894462)
  const hash = createHash("sha256")
  for (const [relativePath, entry] of entries) hash.update(`${relativePath}\0${entry.sha256}\n`)
  assert.equal(hash.digest("hex"), "25be19af32803a11e99c6d70122b5ed74ce0d30ad6403269f85721bfba8916c4")
})

test("a game seed gets its template assets from the bucket, not the repository", async () => {
  const lock = await readTemplateAssetLock("toon-shooter", 1)
  assert.ok(lock)
  const blobs = new Map(Object.values(lock.files).map((entry) => [entry.sha256, entry]))
  const requested: string[] = []
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    // Right size, wrong bytes: the real blobs are not in the repository.
    return new Response(new Uint8Array(blobs.get(url.slice(url.lastIndexOf("/") + 1))!.size))
  }) as typeof fetch

  await assert.rejects(
    readGameSeed("toon-shooter", 1, { baseUrl: "https://assets.example", fetch: fakeFetch }),
    /does not match its lock/
  )
  assert.ok(requested.length > 0)
  assert.ok(requested.every((url) => /^https:\/\/assets\.example\/blobs\/[0-9a-f]{64}$/.test(url)))
  const repositorySeed = await readTemplateSeed("toon-shooter", 1)
  assert.ok(!repositorySeed.files.some((file) => file.relativePath.startsWith("assets/") || file.relativePath === "ASSETS.lock.json"))
})
