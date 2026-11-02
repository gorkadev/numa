import assert from "node:assert/strict"
import { test } from "node:test"

import { TriggerChatTransport } from "@trigger.dev/sdk/chat"

import { startStreamProbe, withFirstChunk } from "./resume-stream"

function streamOf(chunks: string[], onCancel?: () => void) {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      if (!onCancel) controller.close()
    },
    cancel: onCancel,
  })
}

async function readAll(stream: ReadableStream<string>) {
  const reader = stream.getReader()
  const chunks: string[] = []

  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    chunks.push(next.value)
  }

  return chunks
}

test("a stream that closes without a chunk had no turn to resume", async () => {
  assert.equal(await withFirstChunk(streamOf([])), null)
})

test("a stream with chunks keeps every one, in order", async () => {
  const stream = await withFirstChunk(streamOf(["a", "b", "c"]))

  assert.ok(stream)
  assert.deepEqual(await readAll(stream), ["a", "b", "c"])
})

test("cancelling the result cancels the stream it read from", async () => {
  let cancelled = false
  const stream = await withFirstChunk(
    streamOf(["a"], () => {
      cancelled = true
    })
  )

  assert.ok(stream)
  await stream.cancel()
  assert.equal(cancelled, true)
})

function closedWindow(position: number) {
  const record = JSON.stringify({
    data: { type: "text-delta", id: "t", delta: `chunk ${position}` },
    id: `part-${position}`,
  })
  const body = `id: ${position}\ndata: ${JSON.stringify({
    records: [{ body: record, seq_num: position, timestamp: 1 }],
  })}\n\n`

  return new Response(body, { headers: { "content-type": "text/event-stream" } })
}

/** A peek that hangs until aborted, then long-poll windows ending on a running turn. */
function fakeSessionFetch(): typeof fetch {
  let reads = 0

  return async (_url, init = {}) => {
    if (init.method === "POST" || init.method === "PUT") {
      return Response.json({ ok: true, seq: 7, seqNum: 7 })
    }

    if (new Headers(init.headers).get("X-Peek-Settled")) {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"))
        })
      })
    }

    reads += 1

    return closedWindow(reads)
  }
}

test("a send after settling a probe keeps following its turn", async (t) => {
  const realFetch = globalThis.fetch

  globalThis.fetch = fakeSessionFetch()
  t.after(() => {
    globalThis.fetch = realFetch
  })

  const transport = new TriggerChatTransport({
    task: "game-chat",
    accessToken: () => "token",
    baseURL: "http://session.test",
    sessions: { game: { publicAccessToken: "token" } },
  })
  const probe = startStreamProbe((abortSignal) =>
    transport.reconnectToStream({ chatId: "game", abortSignal })
  )

  await new Promise((resolve) => setTimeout(resolve, 20))
  await probe.settle()

  const sent = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "game",
    messageId: undefined,
    messages: [{ id: "m", role: "user", parts: [{ type: "text", text: "hi" }] }],
    abortSignal: undefined,
  })
  const reader = sent.getReader()
  const first = await reader.read()
  const second = await reader.read()

  await reader.cancel()
  assert.equal(await probe.found, null)
  assert.equal(first.done, false)
  assert.equal(second.done, false)
})

test("settling a probe that found a stream cancels it", async () => {
  let cancelled = false
  const probe = startStreamProbe(async () =>
    streamOf(["a"], () => {
      cancelled = true
    })
  )

  await probe.found
  await probe.settle()
  assert.equal(probe.aborted(), true)
  assert.equal(cancelled, true)
})

test("a failed probe settles without throwing", async () => {
  const probe = startStreamProbe(async () => {
    throw new Error("offline")
  })

  await assert.rejects(probe.found, /offline/)
  await probe.settle()
})
