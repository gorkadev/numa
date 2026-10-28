import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { TEMPLATES } from "./catalog"
import { dialogTemplates, menuTemplates, searchTemplates, templatePreviewSrc } from "./picker"

const ids = (templates: readonly { id: string }[]) => templates.map((template) => template.id)

test("the menu lists the first three templates while one of them is selected", () => {
  const firstThree = ids(TEMPLATES.slice(0, 3))
  assert.equal(firstThree.length, 3)
  for (const id of firstThree) {
    assert.deepEqual(ids(menuTemplates(id as never)), firstThree, id)
  }
})

test("a template chosen in the dialog takes the menu's third place", () => {
  const [first, second] = ids(TEMPLATES)
  assert.deepEqual(ids(menuTemplates("legacy-fantasy")), [first, second, "legacy-fantasy"])
})

test("every template but none has a preview image in public", () => {
  assert.equal(templatePreviewSrc("none"), null)
  for (const template of TEMPLATES.filter((entry) => entry.id !== "none")) {
    const src = templatePreviewSrc(template.id)
    assert.equal(src, `/templates/${template.id}.webp`)
    assert.ok(existsSync(path.join("public", src)), src)
  }
})

test("the dialog lists every template but none, which the menu always shows", () => {
  assert.deepEqual(ids(dialogTemplates()), ids(TEMPLATES).filter((id) => id !== "none"))
  assert.equal(ids(menuTemplates("legacy-fantasy"))[0], "none")
})

test("search matches a template's name or description, ignoring case and accents", () => {
  const text = (template: { id: string }) =>
    ({ "tiny-swords": "Tiny Swords Reino en píxeles", platformer: "Platformer Plataformas 3D" })[template.id] ?? ""
  const templates = dialogTemplates().filter((template) => ["tiny-swords", "platformer"].includes(template.id))
  assert.deepEqual(ids(searchTemplates(templates, "PIXELES", text)), ["tiny-swords"])
  assert.deepEqual(ids(searchTemplates(templates, "  ", text)), ids(templates))
  assert.deepEqual(ids(searchTemplates(templates, "dragon", text)), [])
})

test("every template has a short tagline and a longer description in every locale", async () => {
  const { readdirSync, readFileSync } = await import("node:fs")
  for (const locale of readdirSync("messages").filter((file) => file.endsWith(".json"))) {
    const copy = JSON.parse(readFileSync(path.join("messages", locale), "utf8")).GameComposer.templates
    for (const { id } of TEMPLATES) {
      assert.ok(copy[id].tagline, `${locale} ${id} tagline`)
      assert.ok(copy[id].description?.length > copy[id].tagline.length, `${locale} ${id} description`)
    }
  }
})
