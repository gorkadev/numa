import assert from "node:assert/strict"
import { test } from "node:test"

import { settingsParams } from "./settings-url"

function params(query: string, section: Parameters<typeof settingsParams>[1], setting?: string) {
  return settingsParams(new URLSearchParams(query), section, setting).toString()
}

test("opening a section keeps unrelated params", () => {
  assert.equal(params("tab=files", "game"), "tab=files&settings=game")
})

test("a setting rides along with its section", () => {
  assert.equal(params("", "game", "wrap-code"), "settings=game&setting=wrap-code")
})

test("changing section drops a setting that was already revealed", () => {
  assert.equal(params("settings=game&setting=wrap-code", "billing"), "settings=billing")
})

test("closing removes both", () => {
  assert.equal(params("a=1&settings=game&setting=wrap-code", null), "a=1")
})
