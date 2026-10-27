import assert from "node:assert/strict"
import test, { mock } from "node:test"

import { createHoverPrefetcher, HOVER_INTENT_MS } from "./hover-prefetch"

function setup() {
  mock.timers.enable({ apis: ["setTimeout"] })
  const loads: string[] = []
  const pending: (() => void)[] = []
  const prefetcher = createHoverPrefetcher((url) => {
    loads.push(url)
    return new Promise<void>((resolve) => pending.push(resolve))
  })
  return { prefetcher, loads, pending }
}

test.afterEach(() => mock.timers.reset())

test("a pointer passing over files on its way elsewhere loads nothing", () => {
  const { prefetcher, loads } = setup()

  for (const url of ["/a", "/b", "/c", "/d"]) {
    prefetcher.hover(url)
    mock.timers.tick(HOVER_INTENT_MS / 4)
  }
  prefetcher.hover(null)
  mock.timers.tick(HOVER_INTENT_MS * 10)

  assert.deepEqual(loads, [])
})

test("resting on a file loads it once, however often it is revisited", async () => {
  const { prefetcher, loads, pending } = setup()

  prefetcher.hover("/a")
  mock.timers.tick(HOVER_INTENT_MS)
  pending.shift()?.()
  await Promise.resolve()

  prefetcher.hover(null)
  prefetcher.hover("/a")
  mock.timers.tick(HOVER_INTENT_MS)

  assert.deepEqual(loads, ["/a"])
})

test("only one load is ever in flight; a rest during it is skipped, not queued", async () => {
  const { prefetcher, loads, pending } = setup()

  prefetcher.hover("/a")
  mock.timers.tick(HOVER_INTENT_MS)
  prefetcher.hover("/b")
  mock.timers.tick(HOVER_INTENT_MS)
  assert.deepEqual(loads, ["/a"])

  pending.shift()?.()
  await new Promise((resolve) => setImmediate(resolve))
  prefetcher.hover("/b")
  mock.timers.tick(HOVER_INTENT_MS)

  assert.deepEqual(loads, ["/a", "/b"])
})

test("a failed load can be retried by a later rest", async () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  const loads: string[] = []
  const prefetcher = createHoverPrefetcher(async (url) => {
    loads.push(url)
    throw new Error("offline")
  })

  prefetcher.hover("/a")
  mock.timers.tick(HOVER_INTENT_MS)
  await new Promise((resolve) => setImmediate(resolve))
  prefetcher.hover("/a")
  mock.timers.tick(HOVER_INTENT_MS)

  assert.deepEqual(loads, ["/a", "/a"])
})
