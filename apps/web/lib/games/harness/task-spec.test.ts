import assert from "node:assert/strict"
import { test } from "node:test"

import { taskSpecSchema } from "./task-spec"

test("the goal's description tells the model its length limit", () => {
  assert.match(taskSpecSchema.shape.goal.description ?? "", /1200 characters/)
})

test("the acceptance criteria's description tells the model each item's limit", () => {
  assert.match(taskSpecSchema.shape.acceptance.description ?? "", /300 characters/)
})

test("the goal limit itself is unchanged", () => {
  assert.equal(taskSpecSchema.shape.goal.safeParse("a".repeat(1200)).success, true)
  assert.equal(taskSpecSchema.shape.goal.safeParse("a".repeat(1201)).success, false)
})
