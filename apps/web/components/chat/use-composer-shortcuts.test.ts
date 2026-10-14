import assert from "node:assert/strict"
import test from "node:test"
import { getComposerShortcutAction } from "./use-composer-shortcuts"

const event = {
  code: "KeyV", key: "V", ctrlKey: true, shiftKey: true,
  altKey: false, metaKey: false, repeat: false, isComposing: false,
  defaultPrevented: false,
}
const state = {
  phase: "idle" as const, supported: true, pending: false,
  modelOpen: false, pickerAvailable: true, templatePickerAvailable: true,
}

test("Control+Shift+V opens the available template picker", () => {
  assert.equal(getComposerShortcutAction(event, state, false), "template")
})

test("template shortcut leaves unavailable and guarded events untouched", () => {
  for (const patch of [
    { templatePickerAvailable: false }, { pending: true },
    { phase: "recording" as const }, { phase: "finishing" as const },
  ]) assert.equal(getComposerShortcutAction(event, { ...state, ...patch }, false), null)
  for (const patch of [
    { ctrlKey: false }, { shiftKey: false }, { altKey: true },
    { metaKey: true }, { repeat: true }, { isComposing: true },
    { defaultPrevented: true }, { code: "KeyX" },
  ]) assert.equal(getComposerShortcutAction({ ...event, ...patch }, state, false), null)
  assert.equal(getComposerShortcutAction(event, state, true), null)
})

test("existing model, dictation and Escape decisions are preserved", () => {
  const model = { ...event, code: "KeyM" }
  const dictation = { ...event, code: "KeyD" }
  const escape = { ...event, code: "Escape", key: "Escape", ctrlKey: false, shiftKey: false }
  assert.equal(getComposerShortcutAction(model, { ...state, pending: true }, false), "model")
  assert.equal(getComposerShortcutAction(model, { ...state, pickerAvailable: false }, false), null)
  assert.equal(getComposerShortcutAction(dictation, state, false), "start")
  assert.equal(getComposerShortcutAction(dictation, { ...state, supported: false }, false), null)
  assert.equal(getComposerShortcutAction(dictation, { ...state, pending: true }, false), null)
  assert.equal(getComposerShortcutAction(dictation, { ...state, phase: "recording", pending: true }, false), "stop")
  assert.equal(getComposerShortcutAction(dictation, { ...state, phase: "finishing" }, false), null)
  assert.equal(getComposerShortcutAction(escape, { ...state, phase: "recording" }, false), "discard")
  assert.equal(getComposerShortcutAction(escape, { ...state, phase: "recording", modelOpen: true }, false), null)
  assert.equal(getComposerShortcutAction(escape, state, false), null)
  for (const guarded of [model, dictation, escape]) {
    assert.equal(getComposerShortcutAction(guarded, state, true), null)
    assert.equal(getComposerShortcutAction({ ...guarded, repeat: true }, state, false), null)
  }
})
