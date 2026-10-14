import assert from "node:assert/strict"
import test from "node:test"

import { createTranslator } from "next-intl"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import { gameBuildProgressLabelKey } from "./build-progress"

test("maps every build state to a locale-independent translation key", () => {
  assert.equal(gameBuildProgressLabelKey({ kind: "submit" }), "buildProgress.submit")
  assert.equal(gameBuildProgressLabelKey({ kind: "reconnecting" }), "buildProgress.reconnecting")
  for (const phase of ["workspace", "planning", "building", "verifying", "finalizing"] as const) {
    assert.equal(gameBuildProgressLabelKey({ kind: "phase", phase }), `buildProgress.${phase}`)
  }
})

test("keeps absent build progress null", () => {
  assert.equal(gameBuildProgressLabelKey(null), null)
})

test("every progress key resolves in both locales", () => {
  const english = createTranslator({ locale: "en", messages: en, namespace: "ChatActivity" })
  const spanish = createTranslator({ locale: "es", messages: es, namespace: "ChatActivity" })
  for (const state of [
    { kind: "submit" },
    { kind: "reconnecting" },
    ...(["workspace", "planning", "building", "verifying", "finalizing"] as const).map(
      (phase) => ({ kind: "phase" as const, phase })
    ),
  ] as const) {
    const key = gameBuildProgressLabelKey(state)
    assert.ok(key)
    assert.notEqual(english(key), `ChatActivity.${key}`)
    assert.notEqual(spanish(key), `ChatActivity.${key}`)
    assert.notEqual(english(key), spanish(key))
  }
})
