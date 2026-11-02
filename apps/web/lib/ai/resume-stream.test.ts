import assert from "node:assert/strict"
import { test } from "node:test"

import { withFirstChunk } from "./resume-stream"

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
