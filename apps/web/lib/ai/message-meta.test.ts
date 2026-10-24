import assert from "node:assert/strict"
import test from "node:test"
import type { UIMessage } from "ai"

import { readMessageMeta, turnMetaChunk, withTurnMeta } from "./message-meta"
import type { TurnCost } from "./pricing"

const cost = (input: number, output: number): TurnCost =>
  ({
    tokens: {
      inputTokens: input,
      outputTokens: output,
      cachedInputTokens: 0,
      reasoningTokens: 0,
    },
    credits: 1,
  }) as TurnCost

const assistant = (metadata?: unknown): UIMessage => ({
  id: "a",
  role: "assistant",
  parts: [],
  metadata,
})

test("tokens still accumulate across the turns of one message", () => {
  const once = withTurnMeta([assistant()], cost(100, 10))
  const twice = withTurnMeta(once, cost(50, 5))

  assert.deepEqual(readMessageMeta(twice[0]!).tokens, {
    input: 150,
    output: 15,
    cached: 0,
    reasoning: 0,
  })
})

test("stamps the turn's context reading on the reply", () => {
  const stamped = withTurnMeta([assistant()], cost(1, 1), {
    tokens: 16_700,
    window: 1_048_576,
  })

  assert.deepEqual(readMessageMeta(stamped[0]!).context, {
    tokens: 16_700,
    window: 1_048_576,
  })
})

test("a later turn replaces the context reading instead of adding to it", () => {
  const first = withTurnMeta([assistant()], cost(1, 1), {
    tokens: 10,
    window: 100,
  })
  const second = withTurnMeta(first, cost(1, 1), { tokens: 40, window: 100 })

  assert.deepEqual(readMessageMeta(second[0]!).context, {
    tokens: 40,
    window: 100,
  })
})

test("a turn without a reading keeps the one already on the message", () => {
  const first = withTurnMeta([assistant()], cost(1, 1), {
    tokens: 10,
    window: 100,
  })
  const second = withTurnMeta(first, cost(1, 1))

  assert.deepEqual(readMessageMeta(second[0]!).context, {
    tokens: 10,
    window: 100,
  })
})

test("metadata written before context existed still parses", () => {
  const legacy = assistant({
    sentAt: 1,
    tokens: { input: 1, output: 1, cached: 0, reasoning: 0 },
  })

  assert.equal(readMessageMeta(legacy).context, undefined)
  assert.equal(readMessageMeta(legacy).tokens?.input, 1)
})

test("the live receipt carries exactly what the persisted reply will", () => {
  const chunk = turnMetaChunk(assistant(), cost(100, 10), {
    tokens: 16_700,
    window: 1_048_576,
  })
  const persisted = withTurnMeta([assistant()], cost(100, 10), {
    tokens: 16_700,
    window: 1_048_576,
  })

  assert.equal(chunk?.type, "message-metadata")
  assert.deepEqual(
    JSON.parse(
      JSON.stringify((chunk as { messageMetadata: unknown }).messageMetadata)
    ),
    JSON.parse(JSON.stringify(persisted[0]!.metadata))
  )
})

test("a reply the receipt cannot belong to gets no live chunk", () => {
  const user: UIMessage = { id: "u", role: "user", parts: [] }

  assert.equal(turnMetaChunk(user, cost(1, 1)), null)
  assert.equal(turnMetaChunk(undefined, cost(1, 1)), null)
})
