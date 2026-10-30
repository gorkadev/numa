import assert from "node:assert/strict"
import test from "node:test"

import {
  FOCUS_REFRESH_MIN_GAP_MS,
  shouldRefreshOnFocus,
} from "./refresh-policy"

test("a focus right after a refresh is skipped", () => {
  assert.equal(shouldRefreshOnFocus(1_000, 0), false)
})

test("a focus one millisecond short of the gap is skipped", () => {
  assert.equal(
    shouldRefreshOnFocus(FOCUS_REFRESH_MIN_GAP_MS - 1, 0),
    false
  )
})

test("a focus at the gap refreshes", () => {
  assert.equal(shouldRefreshOnFocus(FOCUS_REFRESH_MIN_GAP_MS, 0), true)
})

test("a custom gap is honoured", () => {
  assert.equal(shouldRefreshOnFocus(5_000, 0, 5_000), true)
  assert.equal(shouldRefreshOnFocus(4_999, 0, 5_000), false)
})
