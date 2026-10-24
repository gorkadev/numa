import assert from "node:assert/strict"
import test from "node:test"

import { activityTag, createActivityStore, isGameUnread, workingGameIds } from "./activity"

test("the store tells listeners only when the working set actually changes", () => {
  const store = createActivityStore()
  let calls = 0
  const unsubscribe = store.subscribe(() => calls++)

  store.setWorking(new Set(["a"]))
  store.setWorking(new Set(["a"]))
  assert.equal(calls, 1)
  assert.equal(store.isWorking("a"), true)
  assert.equal(store.isWorking("b"), false)

  store.setWorking(new Set())
  assert.equal(calls, 2)
  assert.equal(store.isWorking("a"), false)

  unsubscribe()
  store.setWorking(new Set(["b"]))
  assert.equal(calls, 2)
})

const GAME = "dcbbf363-1f85-4186-84e3-9ff98a710ff0"
const OTHER = "3c9fc33d-a9a2-4252-abf0-0eea75646207"

function run(overrides: Partial<Parameters<typeof workingGameIds>[0][number]> = {}) {
  return {
    tags: [`chat:${GAME}`, "user:u1"],
    metadata: { working: true },
    isCompleted: false,
    isCancelled: false,
    ...overrides,
  }
}

test("the activity tag names the player the runs belong to", () => {
  assert.equal(activityTag("u1"), "user:u1")
})

test("a live run mid-turn marks its game as working", () => {
  assert.deepEqual([...workingGameIds([run()])], [GAME])
})

test("a live run idle between turns is not working", () => {
  assert.deepEqual([...workingGameIds([run({ metadata: { working: false } })])], [])
  assert.deepEqual([...workingGameIds([run({ metadata: undefined })])], [])
})

test("a finished, failed or cancelled run is never working, whatever its last flag", () => {
  assert.deepEqual([...workingGameIds([run({ isCompleted: true })])], [])
  assert.deepEqual([...workingGameIds([run({ isCancelled: true })])], [])
})

test("any working run of a game is enough, and games stay apart", () => {
  const ids = workingGameIds([
    run({ isCancelled: true }),
    run(),
    run({ tags: [`chat:${OTHER}`], metadata: { working: false } }),
  ])
  assert.deepEqual([...ids], [GAME])
})

test("a run without a chat tag is ignored", () => {
  assert.deepEqual([...workingGameIds([run({ tags: ["user:u1"] })])], [])
})

const earlier = new Date("2026-10-24T10:00:00Z")
const later = new Date("2026-10-24T10:05:00Z")

test("a game whose agent never finished a turn has nothing to read", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: null, lastReadAt: null }), false)
  assert.equal(isGameUnread({ lastTurnFinishedAt: null, lastReadAt: later }), false)
})

test("a finished turn the player never opened is unread", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: earlier, lastReadAt: null }), true)
})

test("a turn that finished after the last read is unread", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: later, lastReadAt: earlier }), true)
})

test("a read at or after the finished turn clears it", () => {
  assert.equal(isGameUnread({ lastTurnFinishedAt: earlier, lastReadAt: later }), false)
  assert.equal(isGameUnread({ lastTurnFinishedAt: earlier, lastReadAt: earlier }), false)
})
