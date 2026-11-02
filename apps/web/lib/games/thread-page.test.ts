import assert from "node:assert/strict"
import test from "node:test"

import type { UIMessage } from "ai"

import {
  changedRows,
  chunkRows,
  jsonbText,
  mergeEarlierMessages,
  mergeSubagentRuns,
  pageStart,
  isGameId,
  parseCursor,
  gameRowQueryKey,
  replacesThread,
  reusableThread,
  threadScope,
  subagentRows,
  THREAD_PAGE_BYTES,
  THREAD_PAGE_TURNS,
  threadQueryKey,
  threadRows,
  withEarlierPage,
  type ThreadSnapshot,
} from "./thread-page"
import type { SubagentRunRecord } from "./harness/records"

function message(id: string, role: UIMessage["role"] = "user"): UIMessage {
  return { id, role, parts: [{ type: "text", text: id }] }
}

test("threadRows numbers messages by their place in the thread", () => {
  const first = message("a")
  const second = message("b", "assistant")

  const size = (value: UIMessage) => Buffer.byteLength(JSON.stringify(value))

  assert.deepEqual(threadRows("game", [first, second]), [
    { gameId: "game", position: 0, role: "user", message: first, size: size(first) },
    { gameId: "game", position: 1, role: "assistant", message: second, size: size(second) },
  ])
})

test("threadRows measures a row in bytes, not characters", () => {
  const [row] = threadRows("game", [message("ñ")])

  assert.equal(row?.size, Buffer.byteLength(JSON.stringify(message("ñ"))))
})

test("threadRows measures a row at the weight the browser receives", () => {
  const heavy: UIMessage = {
    id: "m",
    role: "assistant",
    parts: [
      {
        type: "tool-read_file",
        toolCallId: "r",
        state: "output-available",
        input: { path: "a.js" },
        output: { content: "x".repeat(10_000) },
      },
    ],
  }
  const [row] = threadRows("game", [heavy])

  assert.ok(row && row.size < 500)
  assert.deepEqual(row?.message, heavy)
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

function turns(count: number, size = 10) {
  return Array.from({ length: count }, (_, index) => [
    { position: index * 2, role: "user", size },
    { position: index * 2 + 1, role: "assistant", size },
  ]).flat()
}

test("pageStart holds at most the page's turns", () => {
  const rows = turns(THREAD_PAGE_TURNS + 1)

  assert.equal(pageStart(rows), 2)
})

test("pageStart stops before the turn that crosses the byte ceiling", () => {
  const rows = [
    ...turns(1, THREAD_PAGE_BYTES),
    { position: 2, role: "user", size: 10 },
    { position: 3, role: "assistant", size: 10 },
    { position: 4, role: "user", size: 10 },
    { position: 5, role: "assistant", size: 10 },
  ]

  assert.equal(pageStart(rows), 2)
})

test("pageStart keeps a single turn over the ceiling whole", () => {
  const rows = [
    { position: 0, role: "user", size: 10 },
    { position: 1, role: "user", size: 10 },
    { position: 2, role: "assistant", size: THREAD_PAGE_BYTES * 2 },
    { position: 3, role: "assistant", size: THREAD_PAGE_BYTES * 2 },
  ]

  assert.equal(pageStart(rows), 1)
})

test("pageStart takes in anything ahead of the first user message", () => {
  const rows = [
    { position: 0, role: "assistant", size: 10 },
    { position: 1, role: "user", size: 10 },
    { position: 2, role: "assistant", size: 10 },
  ]

  assert.equal(pageStart(rows), 0)
})

test("pageStart of nothing is the start of the thread", () => {
  assert.equal(pageStart([]), 0)
})

test("threadQueryKey changes when a turn finishes", () => {
  assert.deepEqual(threadQueryKey("game", 5), ["thread", "game", 5])
  assert.notDeepEqual(threadQueryKey("game", 5), threadQueryKey("game", 6))
})

const snapshot: ThreadSnapshot = {
  messages: [message("b")],
  cursor: 2,
  stats: null,
}

test("reusableThread hands back a settled thread", () => {
  assert.equal(reusableThread(snapshot, false), snapshot)
})

test("reusableThread refuses anything while the agent is working", () => {
  assert.equal(reusableThread(snapshot, true), null)
})

test("reusableThread refuses a miss and an empty thread", () => {
  assert.equal(reusableThread(undefined, false), null)
  assert.equal(reusableThread({ ...snapshot, messages: [] }, false), null)
})

test("withEarlierPage prepends the page and moves the cursor", () => {
  const next = withEarlierPage(snapshot, {
    messages: [message("a")],
    start: 0,
  })

  assert.deepEqual(
    next?.messages.map(({ id }) => id),
    ["a", "b"]
  )
  assert.equal(next?.cursor, 0)
  assert.equal(next?.stats, null)
})

test("withEarlierPage leaves an evicted thread evicted", () => {
  assert.equal(withEarlierPage(undefined, { messages: [], start: 0 }), undefined)
})

test("parseCursor reads a position, an absent value and garbage", () => {
  assert.equal(parseCursor("12"), 12)
  assert.equal(parseCursor("0"), 0)
  assert.equal(parseCursor(null), undefined)
  assert.equal(parseCursor("-1"), null)
  assert.equal(parseCursor("1.5"), null)
  assert.equal(parseCursor("abc"), null)
  assert.equal(parseCursor(""), null)
})

test("jsonbText writes objects the way Postgres prints jsonb", () => {
  assert.equal(
    jsonbText({ role: "user", id: "a", nested: [1, { bb: true, a: null }] }),
    '{"id": "a", "role": "user", "nested": [1, {"a": null, "bb": true}]}'
  )
})

test("jsonbText drops undefined fields, as serializing to the column does", () => {
  assert.equal(jsonbText({ a: undefined, b: 1 }), '{"b": 1}')
})

test("jsonbText orders keys by byte length, then bytes", () => {
  assert.equal(jsonbText({ é: 1, b: 2, aa: 3 }), '{"b": 2, "aa": 3, "é": 1}')
})

test("changedRows keeps new and edited rows and skips stored ones", () => {
  const rows = [
    { position: 0, message: "same" },
    { position: 1, message: "edited" },
    { position: 2, message: "new" },
  ]
  const stored = new Map([
    [0, "#same"],
    [1, "#before"],
  ])

  assert.deepEqual(
    changedRows(rows, stored, (row) => `#${row.message}`),
    [rows[1], rows[2]]
  )
})

test("chunkRows splits rows without dropping or reordering any", () => {
  assert.deepEqual(chunkRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})

test("chunkRows of nothing writes nothing", () => {
  assert.deepEqual(chunkRows([], 2), [])
})

function run(agentId: string, status = "done"): SubagentRunRecord {
  return { agentId, status, summary: "full" } as unknown as SubagentRunRecord
}

test("mergeSubagentRuns marks stored rows as listed and fills their detail", () => {
  const [row] = mergeSubagentRuns([{ agentId: "a", status: "done" } as never], [])

  assert.equal(row?.listed, true)
  assert.deepEqual(row?.timeline, [])
  assert.deepEqual(row?.toolCalls, [])
  assert.equal(row?.prompt, "")
  assert.equal(row?.summary, "")
})

test("mergeSubagentRuns lets a live record replace its listed row in place", () => {
  const merged = mergeSubagentRuns(
    [{ agentId: "a", status: "running" } as never, { agentId: "b", status: "done" } as never],
    [run("a")]
  )

  assert.deepEqual(
    merged.map(({ agentId }) => agentId),
    ["a", "b"]
  )
  assert.equal(merged[0]?.status, "done")
  assert.equal(merged[0]?.listed, undefined)
})

test("mergeSubagentRuns appends a live run the list has not reached", () => {
  const merged = mergeSubagentRuns([{ agentId: "a" } as never], [run("z")])

  assert.deepEqual(
    merged.map(({ agentId }) => agentId),
    ["a", "z"]
  )
})

test("parseCursor refuses a position past the column's range", () => {
  assert.equal(parseCursor("2147483647"), 2147483647)
  assert.equal(parseCursor("2147483648"), null)
})

test("isGameId accepts only a uuid", () => {
  assert.equal(isGameId("dcbbf363-1f85-4186-84e3-9ff98a710ff0"), true)
  assert.equal(isGameId("not-a-game"), false)
})

const turn = { seen: 100, revalidated: 200, working: false, held: false }

test("replacesThread takes a turn the mounted thread never saw", () => {
  assert.equal(replacesThread(turn), true)
})

test("replacesThread leaves the thread alone when nothing changed", () => {
  assert.equal(replacesThread({ ...turn, revalidated: 100 }), false)
})

test("replacesThread waits while the game is working", () => {
  assert.equal(replacesThread({ ...turn, working: true }), false)
})

test("replacesThread keeps a thread that already holds the turn", () => {
  assert.equal(replacesThread({ ...turn, held: true }), false)
})

test("gameRowQueryKey is apart from the thread's scope", () => {
  assert.notEqual(gameRowQueryKey("g")[0], threadScope("g")[0])
})
