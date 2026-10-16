import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { presentRunModel } from "./agent-run-presentation.ts"

test("historical names only lose recognized terminal effort suffixes", () => {
  assert.deepEqual(presentRunModel({ modelName: "Gemini (high)" }), { modelName: "Gemini", effort: "high" })
  for (const modelName of ["Gemini", "Gemini (preview)", "Gemini (high) preview", "(high)"]) {
    assert.deepEqual(presentRunModel({ modelName }), { modelName, effort: undefined })
  }
  for (const effort of ["minimal", "low", "medium", "high"]) {
    assert.deepEqual(presentRunModel({ modelName: `Gemini (${effort})` }), { modelName: "Gemini", effort })
  }
})

test("role, tier and effort translations have parity and reuse selector tier vocabulary", () => {
  const locales = ["en", "es"].map((locale) => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")))
  for (const section of ["roles", "tiers", "efforts"]) {
    assert.deepEqual(Object.keys(locales[0].ChatAgents[section]), Object.keys(locales[1].ChatAgents[section]))
  }
  for (const locale of locales) {
    assert.equal(Object.keys(locale.ChatAgents.roles).length, 6)
    for (const role of Object.values(locale.ChatAgents.roles) as { name: string; specialty: string }[]) {
      assert.ok(role.name && role.specialty)
    }
    for (const tier of ["pro", "balanced", "fast"]) {
      assert.equal(locale.ChatAgents.tiers[tier], locale.GameComposer.tiers[tier].label)
    }
  }
})

test("structured effort takes precedence; unknown structured data is not guessed", () => {
  assert.deepEqual(presentRunModel({ modelName: "Gemini (high)", effort: "low" }), { modelName: "Gemini", effort: "low" })
  assert.deepEqual(presentRunModel({ modelName: "Gemini (preview)", effort: "medium" }), { modelName: "Gemini (preview)", effort: "medium" })
  assert.deepEqual(presentRunModel({ modelName: "Gemini (high)", effort: "future" }), { modelName: "Gemini", effort: undefined })
  assert.deepEqual(presentRunModel({}), { modelName: undefined, effort: undefined })
})
