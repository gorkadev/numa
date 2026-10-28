import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import { SETTINGS_SEARCH_INDEX } from "./search-index"
import { searchSettings, type SearchableSetting } from "./search"

function setting(
  id: string,
  title: string,
  extra: Partial<SearchableSetting> = {}
): SearchableSetting {
  return { id, section: "general", title, sectionLabel: "Preferences", ...extra }
}

const settings = [
  setting("language", "Language", { description: "The language the app uses." }),
  setting("theme", "Theme", { keywords: "dark mode light mode appearance" }),
  setting("password", "Contraseña", { sectionLabel: "Seguridad" }),
  setting("wrap", "Wrap code by default", { description: "Long lines in code blocks." }),
  setting("code-theme", "Code colors", { description: "Theme for code." }),
]

test("an empty query finds nothing", () => {
  assert.deepEqual(searchSettings(settings, "   "), [])
})

test("matching ignores case and accents", () => {
  assert.deepEqual(
    searchSettings(settings, "CONTRASENA").map((hit) => hit.id),
    ["password"]
  )
})

test("every word of the query has to match somewhere", () => {
  assert.deepEqual(
    searchSettings(settings, "wrap lines").map((hit) => hit.id),
    ["wrap"]
  )
  assert.deepEqual(searchSettings(settings, "wrap language"), [])
})

test("keywords find what the title does not say", () => {
  assert.deepEqual(
    searchSettings(settings, "dark mode").map((hit) => hit.id),
    ["theme"]
  )
})

test("a title match ranks above a description match", () => {
  assert.deepEqual(
    searchSettings(settings, "theme").map((hit) => hit.id),
    ["theme", "code-theme"]
  )
})

test("the section name finds its settings", () => {
  assert.deepEqual(
    searchSettings(settings, "seguridad").map((hit) => hit.id),
    ["password"]
  )
})

function messageAt(messages: object, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      messages
    )
}

test("every index key resolves to a message in both languages", () => {
  for (const entry of SETTINGS_SEARCH_INDEX) {
    for (const key of [entry.title, entry.description, entry.keywords]) {
      if (!key) continue
      for (const [locale, messages] of [["en", en], ["es", es]] as const) {
        assert.equal(typeof messageAt(messages, key), "string", `${locale}: ${key}`)
      }
    }
  }
})

test("every index entry has a row or group the dialog can scroll to", () => {
  const sources = [
    "components/settings-dialog.tsx",
    ...readdirSync("components/settings").map((file) => join("components/settings", file)),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n")

  for (const entry of SETTINGS_SEARCH_INDEX) {
    assert.ok(
      sources.includes(`settingId="${entry.id}"`) ||
        sources.includes(`data-setting-id="${entry.id}"`),
      entry.id
    )
  }
})

test("index ids are unique", () => {
  const ids = SETTINGS_SEARCH_INDEX.map((entry) => entry.id)
  assert.equal(new Set(ids).size, ids.length)
})
