import assert from "node:assert/strict"
import { test } from "node:test"

import { taskSpecSchema } from "./task-spec"

test("the goal's description tells the model its target length", () => {
  assert.match(taskSpecSchema.shape.goal.description ?? "", /about 1500 characters/)
})

test("the acceptance criteria's description tells the model each item's target length", () => {
  assert.match(taskSpecSchema.shape.acceptance.description ?? "", /about 200 characters/)
})

test("a goal that overshoots its target is accepted; only a runaway one is rejected", () => {
  assert.equal(taskSpecSchema.shape.goal.safeParse("a".repeat(2172)).success, true)
  assert.equal(taskSpecSchema.shape.goal.safeParse("a".repeat(4000)).success, true)
  assert.equal(taskSpecSchema.shape.goal.safeParse("a".repeat(4001)).success, false)
})

test("an acceptance item that overshoots its target is accepted; only a runaway one is rejected", () => {
  const acceptance = taskSpecSchema.shape.acceptance
  assert.equal(acceptance.safeParse(["a".repeat(450)]).success, true)
  assert.equal(acceptance.safeParse(["a".repeat(600)]).success, true)
  assert.equal(acceptance.safeParse(["a".repeat(601)]).success, false)
})
