import assert from "node:assert/strict"
import test from "node:test"

import { createTranslator } from "next-intl"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import { gameBuildProgressLabelKey, thinkingLabelKey } from "./build-progress"

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

test("the thinking line says nothing about a build until the server reports a phase", () => {
  assert.equal(thinkingLabelKey(null, false), "thinking")
  assert.equal(thinkingLabelKey({ kind: "submit" }, false), "thinking")
})

test("the thinking line follows the server's build phase", () => {
  for (const phase of ["workspace", "planning", "building", "verifying", "finalizing"] as const) {
    assert.equal(
      thinkingLabelKey({ kind: "phase", phase }, false),
      `buildProgress.${phase}`
    )
  }
})

test("reconnecting wins over any phase, whichever signal reports it", () => {
  assert.equal(thinkingLabelKey({ kind: "phase", phase: "building" }, true), "reconnecting")
  assert.equal(thinkingLabelKey({ kind: "reconnecting" }, false), "reconnecting")
})

test("every thinking label resolves in both locales", () => {
  const english = createTranslator({ locale: "en", messages: en, namespace: "ChatActivity" })
  const spanish = createTranslator({ locale: "es", messages: es, namespace: "ChatActivity" })

  for (const key of [
    thinkingLabelKey(null, false),
    thinkingLabelKey(null, true),
    ...(["workspace", "planning", "building", "verifying", "finalizing"] as const).map((phase) =>
      thinkingLabelKey({ kind: "phase", phase }, false)
    ),
  ]) {
    assert.notEqual(english(key), `ChatActivity.${key}`)
    assert.notEqual(spanish(key), `ChatActivity.${key}`)
  }
})
