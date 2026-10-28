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

function manifest2d(extra: Record<string, unknown> = {}) {
  return {
    template: { id: "kit2d", version: 1 },
    assetRoot: "assets/kit2d",
    models: [],
    sprites: [
      { id: "warrior-idle", path: "assets/kit2d/Warrior_Idle.png", category: "unit", frameWidth: 192, frameHeight: 192, frames: 8, fps: 10 },
      { id: "castle", path: "assets/kit2d/Castle.png", category: "building", frameWidth: 320, frameHeight: 256, frames: 1 },
    ],
    tilesets: [
      { id: "terrain", path: "assets/kit2d/Tilemap.png", tileSize: 64, columns: 9, rows: 6, tiles: { "flat.center": 10 } },
    ],
    provenance: { three: {} },
    vendor: { threeRevision: "r185", commonRuntimeDependencies: [] },
    ...extra,
  }
}

test("a 2D manifest with sprites, tilesets and no models parses", () => {
  const manifest = parseTemplateManifest(Buffer.from(JSON.stringify(manifest2d())))
  assert.equal(manifest.models.length, 0)
  assert.equal(manifest.sprites?.[0]?.frameWidth, 192)
  assert.equal(manifest.sprites?.[1]?.frames, 1)
  assert.equal(manifest.tilesets?.[0]?.tiles?.["flat.center"], 10)
})

test("sprite frame sizes must be positive whole pixels", () => {
  const bad = manifest2d({
    sprites: [{ id: "x", path: "assets/kit2d/X.png", category: "unit", frameWidth: 0, frameHeight: 192, frames: 1 }],
  })
  assert.throws(() => parseTemplateManifest(Buffer.from(JSON.stringify(bad))), /sprites\.0\.frameWidth/)
})

test("named tiles must be atlas indices", () => {
  const bad = manifest2d({
    tilesets: [{ id: "t", path: "assets/kit2d/T.png", tileSize: 64, columns: 9, rows: 6, tiles: { edge: -1 } }],
  })
  assert.throws(() => parseTemplateManifest(Buffer.from(JSON.stringify(bad))), /tilesets\.0\.tiles\.edge/)
})
