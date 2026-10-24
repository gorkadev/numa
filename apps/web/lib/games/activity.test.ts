import assert from "node:assert/strict"
import test from "node:test"

import {
  activityTag,
  createActivityStore,
  isGameUnread,
  seenGameIds,
  workingGameIds,
} from "./activity"

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

test("the store starts from the server's unread games and a read clears one once", () => {
  const store = createActivityStore()
  store.seedUnread(["a"])
  let calls = 0
  store.subscribe(() => calls++)

  assert.equal(store.isUnread("a"), true)
  store.markRead("a")
  store.markRead("a")
  assert.equal(store.isUnread("a"), false)
  assert.equal(calls, 1)
})

test("a game that stops working becomes unread and is reported as finished", () => {
  const store = createActivityStore()
  store.setWorking(new Set(["a"]), new Set(["a"]))

  assert.deepEqual(store.setWorking(new Set(), new Set(["a"])), ["a"])
  assert.equal(store.isUnread("a"), true)
})

test("the game the player has open finishes without becoming unread", () => {
  const store = createActivityStore()
  store.setOpenGame("a")
  store.setWorking(new Set(["a"]), new Set(["a"]))

  assert.deepEqual(store.setWorking(new Set(), new Set(["a"])), ["a"])
  assert.equal(store.isUnread("a"), false)
})

test("opening a game reads it, and the server's unread list never re-marks it", () => {
  const store = createActivityStore()
  store.seedUnread(["a", "b"])
  store.setOpenGame("a")
  assert.equal(store.isUnread("a"), false)

  store.seedUnread(["a"])
  assert.equal(store.isUnread("a"), false)
  assert.equal(store.isUnread("b"), true)
})

test("a game missing from the runs is not taken as finished", () => {
  const store = createActivityStore()
  store.setWorking(new Set(["a"]), new Set(["a"]))

  assert.deepEqual(store.setWorking(new Set(), new Set()), [])
  assert.equal(store.isUnread("a"), false)
})

test("every game a run belongs to is seen, working or not", () => {
  assert.deepEqual(
    [...seenGameIds([run({ metadata: { working: false } }), run({ tags: ["user:u1"] })])],
    [GAME]
  )
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
