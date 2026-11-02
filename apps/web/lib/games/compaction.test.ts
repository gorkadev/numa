import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ModelMessage, UIMessage } from "ai"

import {
  agentHistory,
  compactionMarker,
  latestCompaction,
  readCompaction,
  shouldAutoCompact,
  withoutFileParts,
  withSummary,
} from "./compaction"

const user = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
})

const assistant = (id: string, text: string): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
})

/** A stand-in for `convertToModelMessages`: one model message per UI message. */
const convert = async (messages: UIMessage[]): Promise<ModelMessage[]> =>
  messages.map((message) => {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")

    return message.role === "user"
      ? { role: "user", content: text }
      : { role: "assistant", content: text }
  })

describe("shouldAutoCompact", () => {
  it("compacts from 80% of the window", () => {
    assert.equal(shouldAutoCompact({ tokens: 800, window: 1000 }), true)
    assert.equal(shouldAutoCompact({ tokens: 950, window: 1000 }), true)
  })

  it("does not compact below 80% or without a reading", () => {
    assert.equal(shouldAutoCompact({ tokens: 799, window: 1000 }), false)
    assert.equal(shouldAutoCompact(undefined), false)
    assert.equal(shouldAutoCompact({ tokens: 10, window: 0 }), false)
  })
})

describe("compaction markers", () => {
  it("reads back what it stores", () => {
    const marker = compactionMarker({ summary: "S", trigger: "auto", tokens: 900, window: 1000 })

    assert.equal(marker.role, "assistant")
    assert.deepEqual(readCompaction(marker), { summary: "S", trigger: "auto", tokens: 900, window: 1000 })
  })

  it("ignores ordinary messages and malformed markers", () => {
    assert.equal(readCompaction(assistant("a", "hi")), null)
    assert.equal(
      readCompaction({ id: "x", role: "assistant", parts: [{ type: "data-compaction", data: { summary: 3 } }] }),
      null
    )
  })

  it("finds the latest marker", () => {
    const first = compactionMarker({ summary: "one", trigger: "auto", tokens: 1, window: 2 })
    const second = compactionMarker({ summary: "two", trigger: "manual", tokens: 1, window: 2 })
    const thread = [user("u1", "a"), first, user("u2", "b"), second, user("u3", "c")]

    assert.deepEqual(latestCompaction(thread), { index: 3, data: readCompaction(second) })
    assert.equal(latestCompaction([user("u1", "a")]), null)
  })
})

describe("withSummary", () => {
  it("opens the first user message with the summary", () => {
    const [first, ...rest] = withSummary("S", [
      { role: "user", content: "next" },
      { role: "assistant", content: "ok" },
    ]) as [ModelMessage, ...ModelMessage[]]

    assert.equal(first.role, "user")
    assert.ok(Array.isArray(first.content))
    assert.match(JSON.stringify(first.content), /S/)
    assert.match(JSON.stringify(first.content), /next/)
    assert.deepEqual(rest, [{ role: "assistant", content: "ok" }])
  })

  it("keeps array content after the summary", () => {
    const [first] = withSummary("S", [{ role: "user", content: [{ type: "text", text: "next" }] }]) as [ModelMessage]

    assert.ok(Array.isArray(first.content))
    assert.equal(first.content.length, 2)
    assert.deepEqual(first.content[1], { type: "text", text: "next" })
  })

  it("adds a user message when the tail does not start with one", () => {
    const messages = withSummary("S", [{ role: "assistant", content: "ok" }])

    assert.equal(messages.length, 2)
    assert.equal(messages[0]!.role, "user")
    assert.match(String(messages[0]!.content), /S/)
  })
})

describe("withoutFileParts", () => {
  it("names attached files instead of sending them", () => {
    const [message] = withoutFileParts([
      {
        role: "user",
        content: [
          { type: "text", text: "use this" },
          { type: "file", mediaType: "image/png", filename: "hero.png", data: new URL("https://example.com/a") },
        ],
      },
    ])

    assert.deepEqual(message!.content, [
      { type: "text", text: "use this" },
      { type: "text", text: "[The player attached hero.png]" },
    ])
  })
})

describe("agentHistory", () => {
  it("returns the full history when nothing was compacted", async () => {
    const full: ModelMessage[] = [{ role: "user", content: "a" }]

    assert.equal(await agentHistory([user("u1", "a")], full, convert), full)
  })

  it("sends the latest summary plus what came after it", async () => {
    const thread = [
      user("u1", "old"),
      assistant("a1", "old reply"),
      compactionMarker({ summary: "SUMMARY", trigger: "auto", tokens: 9, window: 10 }),
      user("u2", "new"),
    ]

    const messages = await agentHistory(thread, [], convert)
    const text = JSON.stringify(messages)

    assert.equal(messages.length, 1)
    assert.match(text, /SUMMARY/)
    assert.match(text, /new/)
    assert.doesNotMatch(text, /old/)
  })
})
