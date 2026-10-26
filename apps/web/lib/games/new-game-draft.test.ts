import assert from "node:assert/strict"
import { test } from "node:test"

import { createDraftStore } from "./new-game-draft"

function memoryStorage() {
  const items = new Map<string, string>()

  return {
    items,
    storage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  }
}

test("there is one draft: typing replaces it and a reload reads it back", () => {
  const { storage, items } = memoryStorage()
  const draft = createDraftStore(() => storage, new EventTarget())

  draft.write("hola")
  draft.write("hola mundo")

  assert.equal(createDraftStore(() => storage, new EventTarget()).read(), "hola mundo")
  assert.equal(items.size, 1)
})

test("an emptied composer leaves no draft behind", () => {
  const { storage, items } = memoryStorage()
  const draft = createDraftStore(() => storage, new EventTarget())

  draft.write("hola")
  draft.write("")

  assert.equal(draft.read(), "")
  assert.equal(items.size, 0)
})

test("sending clears the draft", () => {
  const { storage } = memoryStorage()
  const draft = createDraftStore(() => storage, new EventTarget())

  draft.write("hola")
  draft.clear()

  assert.equal(draft.read(), "")
})

test("the palette overwrites the draft and tells a mounted composer", () => {
  const { storage } = memoryStorage()
  const events = new EventTarget()
  const draft = createDraftStore(() => storage, events)
  const seen: string[] = []
  const unsubscribe = draft.subscribe((text) => seen.push(text))

  draft.write("old draft")
  draft.replace("asdf")
  unsubscribe()
  draft.replace("after unsubscribe")

  assert.deepEqual(seen, ["asdf"])
  assert.equal(draft.read(), "after unsubscribe")
})

test("blocked storage reads as no draft and never throws", () => {
  const blocked = () => {
    throw new Error("SecurityError")
  }
  const draft = createDraftStore(blocked, new EventTarget())

  assert.equal(draft.read(), "")
  assert.doesNotThrow(() => draft.write("hola"))
  assert.doesNotThrow(() => draft.clear())
})
