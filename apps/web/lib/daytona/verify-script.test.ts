import assert from "node:assert/strict"
import { test } from "node:test"

import { CANVAS_VIEWPORT_SHARE_JS, MIN_CANVAS_VIEWPORT_SHARE, VERIFY_SCRIPT_PY } from "./verify-script"

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number }

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

/** Runs the page-side function against a fake 1280x720 page holding these canvases. */
function share(...rects: Rect[]): number | null {
  const document = { querySelectorAll: () => rects.map((r) => ({ getBoundingClientRect: () => r })) }
  const run = new Function("document", "innerWidth", "innerHeight", `return (${CANVAS_VIEWPORT_SHARE_JS})()`)
  return run(document, 1280, 720)
}

test("a full-screen canvas covers the whole viewport", () => {
  assert.equal(share(rect(0, 0, 1280, 720)), 1)
})

test("a canvas pushed below a full-height #app covers none of it", () => {
  assert.equal(share(rect(0, 720, 1280, 720)), 0)
})

test("a centred fixed-size canvas still counts as on screen", () => {
  assert.ok((share(rect(240, 60, 800, 600)) ?? 0) >= MIN_CANVAS_VIEWPORT_SHARE)
})

test("the largest visible canvas decides, and a page without canvas is not judged", () => {
  assert.equal(share(rect(0, 720, 1280, 720), rect(0, 0, 1280, 720)), 1)
  assert.equal(share(), null)
})

test("the check script runs the canvas check and reports it as a template failure", () => {
  assert.ok(VERIFY_SCRIPT_PY.includes("CANVAS_VIEWPORT_SHARE_JS"))
  assert.match(VERIFY_SCRIPT_PY, /game canvas covers only/)
})
