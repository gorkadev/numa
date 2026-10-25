import assert from "node:assert/strict"
import test from "node:test"
import type { UIMessage } from "ai"

import { liveTurnChunk, readMessageMeta, turnMetaChunk, withoutLiveReceipts, withTurnMeta } from "./message-meta"
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
    cached: 9_000,
  })

  assert.deepEqual(readMessageMeta(stamped[0]!).context, {
    tokens: 16_700,
    window: 1_048_576,
    cached: 9_000,
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
    // Plus `live: null`, which clears the turn's provisional receipt in the browser.
    { ...JSON.parse(JSON.stringify(persisted[0]!.metadata)), live: null }
  )
})

test("a reply the receipt cannot belong to gets no live chunk", () => {
  const user: UIMessage = { id: "u", role: "user", parts: [] }

  assert.equal(turnMetaChunk(user, cost(1, 1)), null)
  assert.equal(turnMetaChunk(undefined, cost(1, 1)), null)
})

test("generation speed accumulates across the turns of one message", () => {
  const once = withTurnMeta([assistant()], cost(1, 1), undefined, {
    tokens: 100,
    ms: 1_000,
  })
  const twice = withTurnMeta(once, cost(1, 1), undefined, {
    tokens: 300,
    ms: 1_000,
  })

  assert.deepEqual(readMessageMeta(twice[0]!).speed, { tokens: 400, ms: 2_000 })
})

test("a turn with no speed reading keeps the one already stamped", () => {
  const once = withTurnMeta([assistant()], cost(1, 1), undefined, {
    tokens: 100,
    ms: 1_000,
  })
  const twice = withTurnMeta(once, cost(1, 1))

  assert.deepEqual(readMessageMeta(twice[0]!).speed, { tokens: 100, ms: 1_000 })
})

test("the live receipt carries the same speed the persisted reply will", () => {
  const speed = { tokens: 100, ms: 1_000 }
  const chunk = turnMetaChunk(assistant(), cost(1, 1), undefined, speed)
  const [stamped] = withTurnMeta([assistant()], cost(1, 1), undefined, speed)

  assert.equal(chunk?.type, "message-metadata")
  assert.deepEqual(
    (chunk as { messageMetadata?: unknown }).messageMetadata,
    { ...(stamped?.metadata as object), live: null }
  )
})

test("steps accumulate across the turns of one message", () => {
  const once = withTurnMeta([assistant()], cost(1, 1), undefined, undefined, 3)
  const twice = withTurnMeta(once, cost(1, 1), undefined, undefined, 2)

  assert.equal(readMessageMeta(twice[0]!).steps, 5)
})

test("a turn with no step count keeps the one already stamped", () => {
  const once = withTurnMeta([assistant()], cost(1, 1), undefined, undefined, 3)
  const twice = withTurnMeta(once, cost(1, 1))

  assert.equal(readMessageMeta(twice[0]!).steps, 3)
})

test("the live receipt carries the same step count the persisted reply will", () => {
  const chunk = turnMetaChunk(assistant(), cost(1, 1), undefined, undefined, 4)
  const [stamped] = withTurnMeta(
    [assistant()],
    cost(1, 1),
    undefined,
    undefined,
    4
  )

  assert.deepEqual(
    (chunk as { messageMetadata?: unknown }).messageMetadata,
    { ...(stamped?.metadata as object), live: null }
  )
  assert.equal(readMessageMeta(stamped!).steps, 4)
})

test("timing accumulates across the turns of one message and survives legacy", () => {
  const first = { llmMs: 700, toolMs: 350, ttftMs: 400, ttftSteps: 1 }
  const second = { llmMs: 300, toolMs: 0, ttftMs: 200, ttftSteps: 1 }
  const once = withTurnMeta([assistant()], cost(1, 1), undefined, undefined, undefined, first)
  const twice = withTurnMeta(once, cost(1, 1), undefined, undefined, undefined, second)
  const kept = withTurnMeta(twice, cost(1, 1))

  assert.deepEqual(readMessageMeta(twice[0]!).timing, {
    llmMs: 1_000,
    toolMs: 350,
    ttftMs: 600,
    ttftSteps: 2,
  })
  assert.deepEqual(readMessageMeta(kept[0]!).timing, readMessageMeta(twice[0]!).timing)
  assert.equal(readMessageMeta(assistant({ sentAt: 1 })).timing, undefined)
})

test("a provisional receipt is read on top of what the reply already carries", () => {
  const stored = withTurnMeta([assistant()], cost(100, 10))[0]!
  const live = (liveTurnChunk(cost(40, 4), undefined, 3) as { messageMetadata: object }).messageMetadata
  const meta = readMessageMeta({ ...stored, metadata: { ...(stored.metadata as object), ...live } })

  assert.equal(meta.provisional, true)
  assert.deepEqual(meta.tokens, { input: 140, output: 14, cached: 0, reasoning: 0 })
  assert.equal(meta.credits, 2)
  assert.equal(meta.steps, 3)
})

test("a reply without a provisional receipt is not provisional", () => {
  assert.equal(readMessageMeta(withTurnMeta([assistant()], cost(1, 1))[0]!).provisional, undefined)
})

test("the final receipt never counts the provisional one", () => {
  const live = (liveTurnChunk(cost(40, 4)) as { messageMetadata: object }).messageMetadata
  const [stamped] = withTurnMeta([assistant(live)], cost(100, 10))

  assert.deepEqual(readMessageMeta(stamped!).tokens, { input: 100, output: 10, cached: 0, reasoning: 0 })
  assert.equal("live" in (stamped!.metadata as object), false)
})

test("once a turn's stream ends, its provisional receipt is dropped", () => {
  const live = (liveTurnChunk(cost(40, 4)) as { messageMetadata: object }).messageMetadata
  const stored = withTurnMeta([assistant()], cost(100, 10))[0]!
  const running = { ...stored, metadata: { ...(stored.metadata as object), ...live } }
  const user: UIMessage = { id: "u", role: "user", parts: [], metadata: undefined }

  const [first, second] = withoutLiveReceipts([user, running])

  assert.equal(first, user)
  assert.equal(readMessageMeta(second!).provisional, undefined)
  assert.deepEqual(readMessageMeta(second!).tokens, { input: 100, output: 10, cached: 0, reasoning: 0 })
})

test("a thread with no provisional receipt is returned untouched", () => {
  const messages = withTurnMeta([assistant()], cost(1, 1))
  assert.equal(withoutLiveReceipts(messages), messages)
})
