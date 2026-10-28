import assert from "node:assert/strict"
import test from "node:test"

import { parseTemplateManifest } from "./seed"

function manifestWith(model: Record<string, unknown>) {
  return Buffer.from(
    JSON.stringify({
      template: { id: "kit", version: 1 },
      assetRoot: "assets/kit",
      models: [{ id: "a", path: "assets/kit/A.gltf", ...model }],
      provenance: { three: {} },
      vendor: { threeRevision: "r185", commonRuntimeDependencies: [] },
    })
  )
}

test("platformer categories, interact clips and bounds are accepted", () => {
  for (const category of ["platform", "hazard", "mechanism", "pickup"]) {
    const manifest = parseTemplateManifest(
      manifestWith({
        category,
        bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
        animations: [{ name: "Lever_On", category: "interact" }],
      })
    )
    assert.equal(manifest.models[0]?.category, category)
    assert.deepEqual(manifest.models[0]?.bounds, { min: [-1, 0, -1], max: [1, 2, 1] })
  }
})

test("bounds must be two 3D points", () => {
  assert.throws(
    () => parseTemplateManifest(manifestWith({ bounds: { min: [-1, 0], max: [1, 2, 1] } })),
    /Invalid template manifest: models\.0\.bounds\.min/
  )
})

test("models without bounds still parse", () => {
  assert.equal(parseTemplateManifest(manifestWith({ category: "prop" })).models[0]?.bounds, undefined)
})
