import assert from "node:assert/strict"
import { test } from "node:test"
import type { UIMessage } from "ai"

import { groupParts, type PartBlock } from "./tool-parts"

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
        : [
            block.kind,
            block.kind === "tools" ? block.parts[0]?.toolCallId : null,
          ]
    ),
    [
      ["text", "I will plan the game."],
      ["tools", "plan-1"],
      ["text", "I will build the planned scope."],
      ["tools", "build-1"],
    ]
  )
})

/** Every block as its kind plus the one detail its tests assert on, and its key. */
function describeBlock(block: PartBlock): [string, unknown, string] {
  switch (block.kind) {
    case "text":
      return [block.kind, block.text, block.key]
    case "tools":
      return [block.kind, block.parts.map((part) => part.toolCallId), block.key]
    case "agent":
      return [block.kind, block.records.length, block.key]
    case "ask":
      return [block.kind, block.part.toolCallId, block.key]
    case "reasoning":
      return [block.kind, block.parts.map((part) => part.text), block.key]
  }
}

test("consecutive reasoning parts fold into one block at their arrival position", () => {
  const parts: UIMessage["parts"] = [
    { type: "reasoning", text: "First look", state: "streaming" },
    { type: "reasoning", text: "Second look", state: "done" },
    { type: "text", text: "Here is the plan." },
    {
      type: "tool-read_file",
      toolCallId: "read-1",
      state: "output-available",
      input: { path: "game.js" },
      output: {},
    },
    { type: "reasoning", text: "After the tool", state: "done" },
  ]

  assert.deepEqual(groupParts(parts).map(describeBlock), [
    ["reasoning", ["First look", "Second look"], "reasoning-0"],
    ["text", "Here is the plan.", "text-2"],
    ["tools", ["read-1"], "read-1"],
    ["reasoning", ["After the tool"], "reasoning-4"],
  ])
})

test("reasoning between tool calls starts a new block instead of joining them", () => {
  const parts: UIMessage["parts"] = [
    {
      type: "tool-read_file",
      toolCallId: "read-1",
      state: "input-available",
      input: {},
    },
    { type: "reasoning", text: "Thinking it over", state: "streaming" },
    {
      type: "tool-write_file",
      toolCallId: "write-1",
      state: "input-available",
      input: {},
    },
  ]

  assert.deepEqual(groupParts(parts).map(describeBlock), [
    ["tools", ["read-1"], "read-1"],
    ["reasoning", ["Thinking it over"], "reasoning-1"],
    ["tools", ["write-1"], "write-1"],
  ])
})
