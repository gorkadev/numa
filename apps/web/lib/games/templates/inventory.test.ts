import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { renderTemplateModelInventory, type TemplateInventoryModel } from "./inventory"

for (const [template, expectedCount] of [["cube-world", 107], ["fantasy-cards", 34], ["platformer", 109], ["toon-shooter", 74]] as const) {
  test(`${template} renders the complete grouped manifest inventory`, () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "lib/games/templates", template, "seed/ASSETS.json"), "utf8")) as { models: TemplateInventoryModel[] }
    assert.equal(manifest.models.length, expectedCount)
    assert.equal(new Set(manifest.models.map(({ id }) => id)).size, expectedCount)
    assert.equal(new Set(manifest.models.map(({ path }) => path)).size, expectedCount)
    const rendered = renderTemplateModelInventory(manifest.models)
    assert.equal(rendered, renderTemplateModelInventory([...manifest.models].reverse()))
    assert.ok(rendered.length < 40_000, `inventory is ${rendered.length} characters`)

    const groups = new Map<string, number>()
    for (const model of manifest.models) {
      const category = model.category ?? "uncategorized"
      groups.set(category, (groups.get(category) ?? 0) + 1)
      const animationText = model.animations?.length
        ? `; animations: ${model.animations.map(({ name, category }) => `\`${name}\` (${category})`).join(", ")}`
        : ""
      const boundsText = model.bounds ? `; bounds: min [${model.bounds.min.join(", ")}] max [${model.bounds.max.join(", ")}]` : ""
      const line = `- ${model.id}: \`${model.path}\`${boundsText}${animationText}`
      assert.equal(rendered.split("\n").filter((entry) => entry === line).length, 1, line)
    }
    const headings = rendered.split("\n").filter((line) => line.startsWith("#### "))
    assert.deepEqual(headings, [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([category, count]) => `#### ${category} (${count})`))
    assert.equal(rendered.split("\n").filter((line) => line.startsWith("- ")).length, expectedCount)
  })
}

test("a model with bounds shows them before its animations", () => {
  const rendered = renderTemplateModelInventory([
    {
      id: "chest",
      path: "assets/kit/Chest.gltf",
      category: "mechanism",
      bounds: { min: [-1.07, 0.01, -0.95], max: [1.07, 1.82, 0.93] },
      animations: [{ name: "Chest_Open", category: "interact" }],
    },
  ])
  assert.equal(
    rendered,
    "#### mechanism (1)\n- chest: `assets/kit/Chest.gltf`; bounds: min [-1.07, 0.01, -0.95] max [1.07, 1.82, 0.93]; animations: `Chest_Open` (interact)"
  )
})

test("a 2D template's context lists its sprites and tilesets, points at engine-2d and needs no eager-model receipt", async () => {
  const { renderTemplateContext, templateAssetCatalog } = await import("./inventory")
  const manifest = {
    template: { id: "kit2d", version: 1 },
    assetRoot: "assets/kit2d",
    models: [],
    sprites: [
      { id: "warrior-idle", path: "assets/kit2d/Warrior_Idle.png", category: "unit", frameWidth: 192, frameHeight: 192, frames: 8, fps: 10 },
      { id: "warrior-attack", path: "assets/kit2d/Warrior_Attack.png", category: "unit", frameWidth: 192, frameHeight: 192, frames: 4, fps: 10, loop: false },
      { id: "castle", path: "assets/kit2d/Castle.png", category: "building", frameWidth: 320, frameHeight: 256, frames: 1 },
    ],
    tilesets: [{ id: "terrain", path: "assets/kit2d/Tilemap.png", tileSize: 64, columns: 9, rows: 6, tiles: { "flat.center": 10, "cliff.left": 41 } }],
    provenance: { three: {} },
    vendor: { threeRevision: "r185", commonRuntimeDependencies: [] },
  }
  const context = renderTemplateContext({ descriptor: "# Kit 2D", manifest })

  assert.match(context, /- warrior-idle: `assets\/kit2d\/Warrior_Idle\.png` 192x192, 8 frames, 10 fps/)
  assert.match(context, /- warrior-attack: `assets\/kit2d\/Warrior_Attack\.png` 192x192, 4 frames, 10 fps, plays once/)
  assert.match(context, /- castle: `assets\/kit2d\/Castle\.png` 320x256, 1 frame/)
  assert.match(context, /- terrain: `assets\/kit2d\/Tilemap\.png` 64 px tiles, 9x6; tiles: flat\.center=10, cliff\.left=41/)
  assert.match(context, /`engine-2d`/)
  assert.doesNotMatch(context, /Initial asset readiness contract/)
  assert.doesNotMatch(context, /- Models \(/)

  assert.deepEqual(templateAssetCatalog(manifest, true), { modelIds: [], sharedAssetIds: [], requiresAssetReceipt: false })
})

test("a 3D template still requires a receipt on a fresh build", async () => {
  const { templateAssetCatalog } = await import("./inventory")
  const manifest = { models: [{ id: "a", path: "assets/kit/A.gltf" }], sharedAssets: [{ id: "atlas", path: "assets/kit/Atlas.png", usedBy: ["a"] }] }
  assert.deepEqual(templateAssetCatalog(manifest, true), { modelIds: ["a"], sharedAssetIds: ["atlas"], requiresAssetReceipt: true })
  assert.equal(templateAssetCatalog(manifest, false).requiresAssetReceipt, false)
})

test("a 3D template's context keeps its model inventory and readiness contract", async () => {
  const { renderTemplateContext } = await import("./inventory")
  const context = renderTemplateContext({
    descriptor: "# Kit",
    manifest: {
      template: { id: "kit", version: 1 },
      assetRoot: "assets/kit",
      models: [{ id: "a", path: "assets/kit/A.gltf", category: "prop" }],
      provenance: { three: { "vendor/three/addons/loaders/GLTFLoader.js": {} } },
      vendor: { threeRevision: "r185" },
    },
  })
  assert.match(context, /- Models \(1\):\n#### prop \(1\)\n- a: `assets\/kit\/A\.gltf`/)
  assert.match(context, /- Seeded loader files: `vendor\/three\/addons\/loaders\/GLTFLoader\.js`/)
  assert.match(context, /### Initial asset readiness contract/)
  assert.doesNotMatch(context, /engine-2d/)
})
