import assert from "node:assert/strict"
import { test } from "node:test"
import type { UIMessage } from "ai"

import { groupParts } from "./tool-parts"

test("assistant text remains before each following tool call", () => {
  const parts: UIMessage["parts"] = [
    { type: "text", text: "I will plan the game." },
    {
      type: "tool-plan",
      toolCallId: "plan-1",
      state: "input-available",
      input: {},
    },
    { type: "text", text: "I will build the planned scope." },
    {
      type: "tool-run_tasks",
      toolCallId: "build-1",
      state: "input-available",
      input: { taskIds: ["task-1"] },
    },
  ]

  const blocks = groupParts(parts)
  assert.deepEqual(
    blocks.map((block) =>
      block.kind === "text"
        ? [block.kind, block.text]
        : [block.kind, block.kind === "tools" ? block.parts[0]?.toolCallId : null]
    ),
    [
      ["text", "I will plan the game."],
      ["tools", "plan-1"],
      ["text", "I will build the planned scope."],
      ["tools", "build-1"],
    ]
  )
})
