import assert from "node:assert/strict"
import { test } from "node:test"

import { detachedSend } from "./detached-send"

test("a send reaches the transport without the page's abort signal", async () => {
  const received: object[] = []
  const send = detachedSend(async (options: { chatId: string; abortSignal?: AbortSignal }) => {
    received.push(options)
    return "stream"
  })
  const controller = new AbortController()

  const result = await send({ chatId: "game-1", abortSignal: controller.signal })

  assert.equal(result, "stream")
  assert.deepEqual(received, [{ chatId: "game-1", abortSignal: undefined }])
})

test("aborting the page's signal afterwards reaches nothing", async () => {
  let seen: AbortSignal | undefined
  const send = detachedSend(async (options: { abortSignal?: AbortSignal }) => {
    seen = options.abortSignal
    return null
  })
  const controller = new AbortController()

  await send({ abortSignal: controller.signal })
  controller.abort()

  assert.equal(seen, undefined)
})
