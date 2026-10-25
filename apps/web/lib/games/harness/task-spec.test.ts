import assert from "node:assert/strict"
import { test } from "node:test"

import { taskSpecSchema } from "./task-spec"

test("the goal's description tells the model its length limit", () => {
  assert.match(taskSpecSchema.shape.goal.description ?? "", /2000 characters/)
})

test("the acceptance criteria's description tells the model each item's limit", () => {
  assert.match(taskSpecSchema.shape.acceptance.description ?? "", /300 characters/)
})

test("a goal may run to 2000 characters, and no further", () => {
  assert.equal(taskSpecSchema.shape.goal.safeParse("a".repeat(2000)).success, true)
  assert.equal(taskSpecSchema.shape.goal.safeParse("a".repeat(2001)).success, false)
})
