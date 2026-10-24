import assert from "node:assert/strict"
import test from "node:test"

import { formatShortcutKey, shortcutKeys } from "./keyboard-shortcuts"

test("modifiers read as symbols on a Mac and as words elsewhere", () => {
  assert.equal(formatShortcutKey("mod", true), "⌘")
  assert.equal(formatShortcutKey("mod", false), "Ctrl")
  assert.equal(formatShortcutKey("ctrl", true), "⌃")
  assert.equal(formatShortcutKey("shift", true), "⇧")
  assert.equal(formatShortcutKey("shift", false), "Shift")
  assert.equal(formatShortcutKey("O", true), "O")
})

test("a shortcut's keys are looked up from the catalog by its label", () => {
  assert.deepEqual(shortcutKeys("newGame"), ["mod", "shift", "O"])
  assert.deepEqual(shortcutKeys("toggleTheme"), ["D"])
})
