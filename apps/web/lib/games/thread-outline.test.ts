import assert from "node:assert/strict"
import test from "node:test"

import type { UIMessage } from "ai"

import {
  currentTurnId,
  outlineHasPersistentGutter,
  outlineHeightStyle,
  outlineHitStripWidth,
  outlineIndexFromPointer,
  outlineInteractiveWidth,
  outlineTopPercent,
  outlineTurns,
  previewText,
  type OutlineRun,
} from "./thread-outline"

type Part = UIMessage["parts"][number]

function run(
  id: string,
  role: "user" | "assistant",
  text = "",
  parts?: Part[]
): OutlineRun {
  const message = {
    id,
    role,
    parts: parts ?? [{ type: "text", text }],
  } as UIMessage

  return { id, role, messages: [message] }
}

const runs = [
  run("u1", "user", "Make a racing game"),
  run("a1", "assistant", "Done."),
  run("u2", "user", "  Add a boost button  "),
  run("a2", "assistant", "Added."),
  run("u3", "user", "Make it night"),
  run("a3", "assistant", "Dark now."),
]

test("the outline lists every player turn with its trimmed text, in order", () => {
  assert.deepEqual(
    outlineTurns(runs).map(({ id, text }) => ({ id, text })),
    [
      { id: "u1", text: "Make a racing game" },
      { id: "u2", text: "Add a boost button" },
      { id: "u3", text: "Make it night" },
    ]
  )
})

test("a turn with no text is still listed, so the rail keeps one mark per turn", () => {
  assert.deepEqual(outlineTurns([run("u1", "user", "   ")]), [
    { id: "u1", text: "", assistantText: null },
  ])
})

test("each turn carries the reply that answered it", () => {
  assert.deepEqual(
    outlineTurns(runs).map((turn) => turn.assistantText),
    ["Done.", "Added.", "Dark now."]
  )
})

test("a turn nobody has answered yet has no reply text", () => {
  assert.equal(
    outlineTurns([run("u1", "user", "Hi")])[0]?.assistantText,
    null
  )
})

test("the reply is what the agent said last, not what it said before working", () => {
  const reply = run("a1", "assistant", "", [
    { type: "text", text: "Let me read the files." },
    { type: "tool-read_file", toolCallId: "t1", state: "output-available" },
    { type: "text", text: "All fixed." },
  ] as Part[])

  assert.equal(
    outlineTurns([run("u1", "user", "Fix it"), reply])[0]?.assistantText,
    "All fixed."
  )
})

test("data parts stamped after the answer do not hide it", () => {
  const reply = run("a1", "assistant", "", [
    { type: "text", text: "All fixed." },
    { type: "data-game-verification", data: { status: "ok" } },
  ] as Part[])

  assert.equal(
    outlineTurns([run("u1", "user", "Fix it"), reply])[0]?.assistantText,
    "All fixed."
  )
})

test("a reply that ended on a tool call has no final text", () => {
  const reply = run("a1", "assistant", "", [
    { type: "text", text: "Let me read the files." },
    { type: "tool-read_file", toolCallId: "t1", state: "output-available" },
  ] as Part[])

  assert.equal(
    outlineTurns([run("u1", "user", "Fix it"), reply])[0]?.assistantText,
    null
  )
})

test("a reply spread over several messages is read from the last one", () => {
  const first = run("a1", "assistant", "Working on it.")
  const second = run("a2", "assistant", "Finished.")
  const merged: OutlineRun = {
    ...first,
    messages: [...first.messages, ...second.messages],
  }

  assert.equal(
    outlineTurns([run("u1", "user", "Go"), merged])[0]?.assistantText,
    "Finished."
  )
})

test("a reply a player message cut off still belongs to its own turn", () => {
  const turns = outlineTurns([
    run("u1", "user", "One"),
    run("u2", "user", "Two"),
    run("a2", "assistant", "Reply to two"),
  ])

  assert.deepEqual(
    turns.map((turn) => turn.assistantText),
    [null, "Reply to two"]
  )
})

test("a reply at the top of the screen keeps its turn current, even with the next message in view", () => {
  assert.equal(currentTurnId(runs, ["a1", "u2", "a2"]), "u1")
})

test("a player message at the top of the screen is the current turn", () => {
  assert.equal(currentTurnId(runs, ["u2", "a2", "u3"]), "u2")
})

test("visible ids are matched by position in the thread, not by the order they arrive in", () => {
  assert.equal(currentTurnId(runs, ["u3", "a2"]), "u2")
})

test("nothing on screen means no current turn", () => {
  assert.equal(currentTurnId(runs, []), null)
})

test("a reply before any player message belongs to no turn", () => {
  assert.equal(currentTurnId([run("a0", "assistant"), ...runs], ["a0"]), null)
})

test("marks are spread evenly down the rail, first at the top and last at the bottom", () => {
  assert.equal(outlineTopPercent(0, 5), 0)
  assert.equal(outlineTopPercent(2, 5), 50)
  assert.equal(outlineTopPercent(4, 5), 100)
})

test("a single mark sits at the top, and a stray index is clamped onto the rail", () => {
  assert.equal(outlineTopPercent(0, 1), 0)
  assert.equal(outlineTopPercent(-3, 5), 0)
  assert.equal(outlineTopPercent(99, 5), 100)
})

test("the rail grows 8px per turn until it hits the viewport-relative cap", () => {
  assert.equal(outlineHeightStyle(11), "min(80px, calc(100vh - 18rem))")
  assert.equal(outlineHeightStyle(1), "min(1px, calc(100vh - 18rem))")
})

test("the pointer picks the nearest mark", () => {
  const rail = { railTop: 100, railHeight: 80, itemCount: 5 }

  assert.equal(outlineIndexFromPointer({ ...rail, pointerY: 100 }), 0)
  assert.equal(outlineIndexFromPointer({ ...rail, pointerY: 129 }), 1)
  assert.equal(outlineIndexFromPointer({ ...rail, pointerY: 131 }), 2)
  assert.equal(outlineIndexFromPointer({ ...rail, pointerY: 180 }), 4)
})

test("a pointer beyond either end of the rail still picks the first or last mark", () => {
  const rail = { railTop: 100, railHeight: 80, itemCount: 5 }

  assert.equal(outlineIndexFromPointer({ ...rail, pointerY: 0 }), 0)
  assert.equal(outlineIndexFromPointer({ ...rail, pointerY: 900 }), 4)
})

test("a rail with nothing to point at picks nothing", () => {
  assert.equal(
    outlineIndexFromPointer({
      railTop: 0,
      railHeight: 80,
      itemCount: 0,
      pointerY: 10,
    }),
    null
  )
  assert.equal(
    outlineIndexFromPointer({
      railTop: 0,
      railHeight: 0,
      itemCount: 3,
      pointerY: 10,
    }),
    null
  )
})

test("the rail's hit strip is the free space beside the thread, capped at 40px", () => {
  assert.equal(outlineHitStripWidth(1000, 768), 40)
  assert.equal(outlineHitStripWidth(800, 768), 4)
})

test("a thread as wide as its pane leaves no room for a hit strip", () => {
  assert.equal(outlineHitStripWidth(768, 768), 0)
  assert.equal(outlineHitStripWidth(600, 768), 0)
  assert.equal(outlineHitStripWidth(0, 768), 0)
  assert.equal(outlineHitStripWidth(Number.NaN, 768), 0)
})

test("the rail stays visible only when there is 48px or more beside the thread", () => {
  assert.equal(outlineHasPersistentGutter(864, 768), true)
  assert.equal(outlineHasPersistentGutter(862, 768), false)
  assert.equal(outlineHasPersistentGutter(768, 768), false)
})

test("the hit strip opens up to hold the preview card while a turn is previewed", () => {
  assert.equal(outlineInteractiveWidth(40, false), 40)
  assert.equal(outlineInteractiveWidth(40, true), "22rem")
})

test("a preview reads as plain text: links, emphasis and headings lose their markup", () => {
  assert.equal(
    previewText("# Done\n\n**Added** a [boost](https://x.dev) *button*."),
    "Done Added a boost button."
  )
})

test("a preview flattens lists, quotes and tables to their words", () => {
  assert.equal(previewText("- one\n- two\n1. three\n> four"), "one two three four")
  assert.equal(previewText("| a | b |\n|---|---|\n| 1 | 2 |"), "a b 1 2")
})

test("a preview keeps the code inside fences and inline code, without the fence", () => {
  assert.equal(
    previewText("Run `pnpm dev`:\n```ts\nconst a = 1\n```"),
    "Run pnpm dev: const a = 1"
  )
})

test("a preview drops html but keeps image captions", () => {
  assert.equal(
    previewText("<b>bold</b> text ![a cat](x.png) <!-- hidden -->"),
    "bold text a cat"
  )
})

test("a preview only reads the start of a long reply", () => {
  assert.equal(previewText("a".repeat(5000))?.length, 1500)
})

test("a preview of nothing is nothing", () => {
  assert.equal(previewText(null), null)
  assert.equal(previewText("  \n "), null)
  assert.equal(previewText("```\n```"), null)
})
