import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseCancellationRequest,
  setCancellation,
  type CancellationDeps,
} from "./cancellation"

function fakeDeps(overrides: Partial<CancellationDeps> = {}) {
  const updates: unknown[] = []
  const deps: CancellationDeps = {
    activeSubscriptionId: async () => "sub-1",
    update: async (id, body) => {
      updates.push({ id, body })
    },
    ...overrides,
  }
  return { deps, updates }
}

test("a known reason with a comment is accepted and trimmed", () => {
  assert.deepEqual(
    parseCancellationRequest({ reason: "too_expensive", comment: "  pricey  " }),
    { reason: "too_expensive", comment: "pricey" }
  )
})

test("an empty comment becomes null", () => {
  assert.deepEqual(parseCancellationRequest({ reason: "unused", comment: "  " }), {
    reason: "unused",
    comment: null,
  })
})

test("an unknown or missing reason is rejected", () => {
  assert.equal(parseCancellationRequest({ reason: "hacked" }), null)
  assert.equal(parseCancellationRequest({}), null)
  assert.equal(parseCancellationRequest(null), null)
})

test("a comment over the limit is rejected", () => {
  assert.equal(
    parseCancellationRequest({ reason: "other", comment: "x".repeat(1001) }),
    null
  )
})

test("cancelling schedules the end of the period with the reason", async () => {
  const { deps, updates } = fakeDeps()

  assert.equal(
    await setCancellation(
      { cancel: true, reason: "missing_features", comment: "no multiplayer" },
      deps
    ),
    "ok"
  )
  assert.deepEqual(updates, [
    {
      id: "sub-1",
      body: {
        cancelAtPeriodEnd: true,
        customerCancellationReason: "missing_features",
        customerCancellationComment: "no multiplayer",
      },
    },
  ])
})

test("resuming clears the scheduled cancellation", async () => {
  const { deps, updates } = fakeDeps()

  assert.equal(await setCancellation({ cancel: false }, deps), "ok")
  assert.deepEqual(updates, [
    { id: "sub-1", body: { cancelAtPeriodEnd: false } },
  ])
})

test("no paid subscription means nothing is updated", async () => {
  const { deps, updates } = fakeDeps({ activeSubscriptionId: async () => null })

  assert.equal(await setCancellation({ cancel: false }, deps), "no_subscription")
  assert.deepEqual(updates, [])
})

test("a failed update is reported, not thrown", async () => {
  const { deps } = fakeDeps({
    update: async () => {
      throw new Error("polar down")
    },
  })

  assert.equal(
    await setCancellation({ cancel: true, reason: "other", comment: null }, deps),
    "failed"
  )
})
