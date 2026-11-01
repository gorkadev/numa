import assert from "node:assert/strict"
import test from "node:test"

import type { UIMessage } from "ai"

import {
  mergeEarlierMessages,
  subagentRows,
  threadRows,
  withoutLoadedStats,
} from "./thread-page"

function message(id: string, role: UIMessage["role"] = "user"): UIMessage {
  return { id, role, parts: [{ type: "text", text: id }] }
}

test("threadRows numbers messages by their place in the thread", () => {
  const first = message("a")
  const second = message("b", "assistant")

  assert.deepEqual(threadRows("game", [first, second]), [
    { gameId: "game", position: 0, role: "user", message: first },
    { gameId: "game", position: 1, role: "assistant", message: second },
  ])
})

test("threadRows of an empty thread is empty", () => {
  assert.deepEqual(threadRows("game", []), [])
})

test("mergeEarlierMessages puts the older page first", () => {
  const merged = mergeEarlierMessages([message("c")], [message("a"), message("b")])

  assert.deepEqual(
    merged.map(({ id }) => id),
    ["a", "b", "c"]
  )
})

test("mergeEarlierMessages keeps the live copy of a message it already holds", () => {
  const live = message("b", "assistant")
  const stale = { ...live, parts: [] }

  const merged = mergeEarlierMessages([live], [message("a"), stale])

  assert.deepEqual(
    merged.map(({ id }) => id),
    ["a", "b"]
  )
  assert.equal(merged[1], live)
})

test("withoutLoadedStats drops the skeletons of messages now loaded", () => {
  const stats = [message("a", "assistant"), message("b", "assistant")]

  assert.deepEqual(
    withoutLoadedStats(stats, [message("b", "assistant")]).map(({ id }) => id),
    ["a"]
  )
})

test("subagentRows numbers runs in first-dispatch order", () => {
  const record = { agentId: "agent-1", role: "explore", status: "done" }

  assert.deepEqual(subagentRows("game", [record as never]), [
    {
      gameId: "game",
      agentId: "agent-1",
      position: 0,
      record,
    },
  ])
})
