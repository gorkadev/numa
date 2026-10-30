import assert from "node:assert/strict"
import test from "node:test"

import type { FileTreeNode } from "./files"
import { createFileTreeCache } from "./file-tree-cache"

const tree = (name: string): FileTreeNode[] => [
  { type: "file", name, path: name } as FileTreeNode,
]

function setup(ttlMs = 1000) {
  let clock = 0
  let calls = 0
  let nextError: Error | null = null
  const load = createFileTreeCache({
    fetchTree: async (gameId) => {
      calls += 1
      if (nextError) {
        const error = nextError
        nextError = null
        throw error
      }
      return tree(`${gameId}-${calls}`)
    },
    now: () => clock,
    ttlMs,
  })

  return {
    load,
    calls: () => calls,
    advance: (ms: number) => (clock += ms),
    failNext: () => (nextError = new Error("500")),
  }
}

test("two consumers of the same version share one request", async () => {
  const cache = setup()
  const [a, b] = await Promise.all([cache.load("g", 1), cache.load("g", 1)])

  assert.equal(cache.calls(), 1)
  assert.equal(a, b)
})

test("a finished listing is reused while the version holds", async () => {
  const cache = setup()
  await cache.load("g", 1)
  await cache.load("g", 1)

  assert.equal(cache.calls(), 1)
})

test("a new version fetches again", async () => {
  const cache = setup()
  await cache.load("g", 1)
  await cache.load("g", 2)

  assert.equal(cache.calls(), 2)
})

test("games are cached independently", async () => {
  const cache = setup()
  await cache.load("a", 1)
  await cache.load("b", 1)

  assert.equal(cache.calls(), 2)
})

test("a listing older than the ttl is fetched again", async () => {
  const cache = setup(1000)
  await cache.load("g", 1)
  cache.advance(999)
  await cache.load("g", 1)
  assert.equal(cache.calls(), 1)

  cache.advance(1)
  await cache.load("g", 1)
  assert.equal(cache.calls(), 2)
})

test("a failed request is not replayed", async () => {
  const cache = setup()
  cache.failNext()

  await assert.rejects(cache.load("g", 1), /500/)
  await cache.load("g", 1)

  assert.equal(cache.calls(), 2)
})
