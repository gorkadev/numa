import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { renderTemplateModelInventory, type TemplateInventoryModel } from "./inventory"

for (const [template, expectedCount] of [["cube-world", 107], ["fantasy-cards", 34]] as const) {
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
      const line = `- ${model.id}: \`${model.path}\`${animationText}`
      assert.equal(rendered.split("\n").filter((entry) => entry === line).length, 1, line)
    }
    const headings = rendered.split("\n").filter((line) => line.startsWith("#### "))
    assert.deepEqual(headings, [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([category, count]) => `#### ${category} (${count})`))
    assert.equal(rendered.split("\n").filter((line) => line.startsWith("- ")).length, expectedCount)
  })
}
