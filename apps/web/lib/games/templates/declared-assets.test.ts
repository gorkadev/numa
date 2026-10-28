import assert from "node:assert/strict"
import test from "node:test"

import { parseTemplateManifest, undeclaredAssetPaths } from "./seed"

const manifest = parseTemplateManifest(
  Buffer.from(
    JSON.stringify({
      template: { id: "kit", version: 1 },
      assetRoot: "assets/kit",
      models: [{ id: "a", path: "assets/kit/A.gltf", bufferPath: "assets/kit/A.bin" }],
      sharedAssets: [{ id: "atlas", path: "assets/kit/Atlas.png", usedBy: ["a"] }],
      licenseEvidence: { path: "assets/kit/License.txt", license: "CC0", sourcePack: "Kit" },
      provenance: { three: {} },
      vendor: { threeRevision: "r185", commonRuntimeDependencies: [] },
    })
  )
)

test("undeclaredAssetPaths lists files the manifest does not account for", () => {
  assert.deepEqual(
    undeclaredAssetPaths(manifest, [
      "assets/kit/A.gltf",
      "assets/kit/A.bin",
      "assets/kit/Atlas.png",
      "assets/kit/License.txt",
      "assets/kit/.DS_Store",
      "assets/kit/Old.gltf",
    ]),
    ["assets/kit/.DS_Store", "assets/kit/Old.gltf"]
  )
})

test("every locked asset of the shipped templates is declared", async () => {
  const { readTemplateAssetLock, readTemplateContract } = await import("./seed")
  for (const id of ["cube-world", "fantasy-cards", "platformer", "toon-shooter"]) {
    const [lock, contract] = await Promise.all([readTemplateAssetLock(id, 1), readTemplateContract(id, 1)])
    assert.ok(lock && contract)
    assert.deepEqual(undeclaredAssetPaths(contract.manifest, Object.keys(lock.files)), [], id)
  }
})
