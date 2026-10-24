import assert from "node:assert/strict"
import test from "node:test"

import { DEFAULT_TEMPLATE_ID, templateFromQuery } from "./catalog"

test("a known template in the query preselects it", () => {
  assert.equal(templateFromQuery("cube-world"), "cube-world")
})

test("a missing or unknown template in the query falls back to the default", () => {
  assert.equal(templateFromQuery(null), DEFAULT_TEMPLATE_ID)
  assert.equal(templateFromQuery("not-a-template"), DEFAULT_TEMPLATE_ID)
})
