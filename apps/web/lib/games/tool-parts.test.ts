import assert from "node:assert/strict"
import { test } from "node:test"
import type { UIMessage } from "ai"

import { askPlayerAnswer, askPlayerQuestion } from "./ask-player"
import type { SubagentRunRecord } from "./harness/records"
import { deriveTaskStrip } from "./plan-tasks"
import {
  collectThreadSubagentRuns,
  groupParts,
  isTrimmed,
  toolError,
  toolLabel,
  trimMessage,
  withoutTrimmedParts,
  type PartBlock,
  type ToolPart,
} from "./tool-parts"

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

test("reasoning runs get distinct keys even when the provider reuses a part id", () => {
  // Some providers number reasoning parts per step, so every step's first part is id "0".
  const parts = [
    { type: "reasoning", id: "0", text: "First step.", state: "done" },
    { type: "text", text: "Done with step one.", state: "done" },
    { type: "reasoning", id: "0", text: "Second step.", state: "done" },
  ] as UIMessage["parts"]

  const keys = groupParts(parts).map((block) => block.key)

  assert.equal(new Set(keys).size, keys.length, keys.join(", "))
})

const fullRun: SubagentRunRecord = {
  agentId: "task-1:abc",
  role: "explorer",
  displayName: "Explorer",
  tier: "balanced",
  slot: "mid",
  modelId: "model",
  modelName: "Model",
  status: "done",
  activity: "done",
  steps: 2,
  toolCalls: [{ toolName: "read_file", toolCallId: "c", ok: true }],
  edits: ["game.js"],
  timeline: [{ kind: "text", text: "HEAVY" }],
  skills: [],
  tokens: {
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    reasoningTokens: 0,
  },
  prompt: "HEAVY",
  summary: "HEAVY",
}

function assistant(...parts: unknown[]): UIMessage {
  return { id: "m", role: "assistant", parts: parts as UIMessage["parts"] }
}

function toolPartOf(message: UIMessage, index = 0): ToolPart {
  return message.parts[index] as ToolPart
}

test("trimMessage drops a file result and keeps what labels the call", () => {
  const part = {
    type: "tool-read_file",
    toolCallId: "r",
    state: "output-available",
    input: { path: "game.js" },
    output: { path: "game.js", content: "x".repeat(50_000) },
    callProviderMetadata: { google: { thoughtSignature: "y".repeat(50_000) } },
  }

  const trimmed = trimMessage(assistant(part))
  const kept = toolPartOf(trimmed)

  assert.equal(isTrimmed(kept), true)
  assert.equal(toolLabel(kept), toolLabel(part as ToolPart))
  assert.equal(toolError(kept), null)
  assert.ok(JSON.stringify(trimmed).length < 300)
})

test("trimMessage keeps a tool's reported failure", () => {
  const failed = trimMessage(
    assistant({
      type: "tool-write_file",
      toolCallId: "w",
      state: "output-available",
      input: { path: "a.js", content: "x".repeat(1000) },
      output: { error: "disk full" },
    })
  )

  assert.equal(toolError(toolPartOf(failed)), "disk full")
})

test("trimMessage keeps a thrown error's text", () => {
  const failed = trimMessage(
    assistant({
      type: "tool-replace_text",
      toolCallId: "w",
      state: "output-error",
      input: { path: "a.js", find: "x".repeat(1000) },
      errorText: "boom",
    })
  )

  assert.equal(toolError(toolPartOf(failed)), "boom")
  assert.equal(toolLabel(toolPartOf(failed)), "Couldn't edit a.js")
})

test("trimMessage leaves ask_player whole, asked and answered", () => {
  const input = {
    question: "Which?",
    options: [
      { id: "a", label: "A", description: "first" },
      { id: "b", label: "B" },
    ],
  }
  const message = assistant(
    { type: "tool-ask_player", toolCallId: "q1", state: "input-available", input },
    {
      type: "tool-ask_player",
      toolCallId: "q2",
      state: "output-available",
      input,
      output: { optionId: "a", label: "A" },
    }
  )

  const trimmed = trimMessage(message)
  const answered = toolPartOf(trimmed, 1)

  assert.deepEqual(trimmed, message)
  assert.equal(
    askPlayerAnswer(answered, askPlayerQuestion(answered)!)?.description,
    "first"
  )
})

test("trimMessage leaves a tool in progress whole", () => {
  const message = assistant(
    {
      type: "tool-read_file",
      toolCallId: "r",
      state: "input-available",
      input: { path: "a.js" },
    },
    {
      type: "tool-explore",
      toolCallId: "p",
      state: "output-available",
      preliminary: true,
      input: {},
      output: fullRun,
    },
    {
      type: "tool-run_tasks",
      toolCallId: "s",
      state: "output-available",
      input: { taskIds: ["task-1"] },
      output: { runs: [{ ...fullRun, status: "running" }] },
    }
  )

  assert.deepEqual(trimMessage(message), message)
})

test("trimMessage leaves a tool it does not know whole", () => {
  const message = assistant({
    type: "tool-new_tool",
    toolCallId: "n",
    state: "output-available",
    input: { any: 1 },
    output: { any: 2 },
  })

  assert.deepEqual(trimMessage(message), message)
})

test("trimMessage leaves text and reasoning whole", () => {
  const message = assistant(
    { type: "text", text: "hello", state: "done" },
    { type: "reasoning", text: "because", state: "done" }
  )

  assert.deepEqual(trimMessage(message), message)
})

test("a trimmed dispatch still renders its entry and marks it listed", () => {
  const blocks = groupParts(
    trimMessage(
      assistant({
        type: "tool-explore",
        toolCallId: "e",
        state: "output-available",
        input: { prompt: "HEAVY" },
        output: { envelope: { summary: "HEAVY" }, record: fullRun },
      })
    ).parts
  )

  assert.equal(blocks[0]?.kind, "agent")

  const record = blocks[0]?.kind === "agent" ? blocks[0].records[0] : undefined

  assert.equal(record?.listed, true)
  assert.equal(record?.status, "done")
  assert.equal(record?.role, "explorer")
  assert.ok(!JSON.stringify(blocks).includes("HEAVY"))
})

test("a run from a trimmed part reaches the panel marked as listed", () => {
  const trimmed = trimMessage(
    assistant({
      type: "tool-run_tasks",
      toolCallId: "t",
      state: "output-available",
      input: { taskIds: ["task-1"] },
      output: { outcomes: [{ taskId: "task-1", record: fullRun }] },
    })
  )

  assert.deepEqual(
    collectThreadSubagentRuns([trimmed]).map(({ agentId, listed }) => [
      agentId,
      listed,
    ]),
    [["task-1:abc", true]]
  )
})

test("whole messages keep yielding whole runs", () => {
  const [run] = collectThreadSubagentRuns([
    assistant({
      type: "tool-explore",
      toolCallId: "e",
      state: "output-available",
      input: {},
      output: { record: fullRun },
    }),
  ])

  assert.deepEqual(run, fullRun)
})

test("the task strip reads the same from a trimmed thread", () => {
  const messages = [
    assistant(
      {
        type: "tool-plan",
        toolCallId: "p",
        state: "output-available",
        input: { goal: "HEAVY" },
        output: {
          record: fullRun,
          tasks: [{ id: "old", title: "Old", role: "audio" }],
        },
      }
    ),
    assistant(
      {
        type: "tool-run_tasks",
        toolCallId: "t",
        state: "output-available",
        input: {
          tasks: [
            { id: "task-1", title: "One", role: "gameplay", body: "HEAVY" },
            { id: "task-2", title: "Two", role: "visuals", body: "HEAVY" },
          ],
        },
        output: {
          outcomes: [
            {
              taskId: "task-1",
              envelope: { status: "done", summary: "HEAVY" },
              record: fullRun,
            },
            {
              taskId: "task-2",
              envelope: { status: "blocked", summary: "HEAVY" },
              record: { ...fullRun, agentId: "task-2:abc" },
            },
          ],
        },
      }
    ),
  ]

  const trimmed = messages.map(trimMessage)

  assert.deepEqual(deriveTaskStrip(trimmed), deriveTaskStrip(messages))
  assert.deepEqual(
    deriveTaskStrip(trimmed)?.map(({ status }) => status),
    ["done", "failed"]
  )
  assert.ok(!JSON.stringify(trimmed).includes("HEAVY"))
})

test("a rejected run_tasks still reads as not dispatched", () => {
  const message = assistant({
    type: "tool-run_tasks",
    toolCallId: "t",
    state: "output-available",
    input: { tasks: [{ id: "a", title: "A", role: "audio" }] },
    output: { error: "cycle" },
  })

  assert.equal(deriveTaskStrip([trimMessage(message)]), undefined)
  assert.equal(toolError(toolPartOf(trimMessage(message))), "cycle")
})

test("an extreme turn stays light once trimmed", () => {
  const parts = Array.from({ length: 500 }, (_, index) => ({
    type: "tool-read_file",
    toolCallId: `call-${index}`,
    state: "output-available",
    input: { path: "src/game.js" },
    output: { path: "src/game.js", content: "x".repeat(20_000) },
    callProviderMetadata: { google: { thoughtSignature: "y".repeat(2_000) } },
  }))

  const bytes = JSON.stringify(trimMessage(assistant(...parts))).length

  assert.ok(bytes < 100 * 1024, `${bytes} bytes`)
})

test("nothing trimmed is handed to the transport, the answer is", () => {
  const answer = {
    type: "tool-ask_player",
    toolCallId: "q",
    state: "output-available",
    input: { question: "Which?", options: [] },
    output: { optionId: "a", label: "A" },
  }
  const history = trimMessage(
    assistant(
      { type: "text", text: "hi", state: "done" },
      {
        type: "tool-read_file",
        toolCallId: "r",
        state: "output-available",
        input: { path: "a.js" },
        output: { content: "x" },
      },
      answer
    )
  )

  assert.deepEqual(withoutTrimmedParts([history]).at(-1)?.parts, [
    { type: "text", text: "hi", state: "done" },
    answer,
  ])
})

test("a message with nothing trimmed reaches the transport as it is", () => {
  const message = assistant({ type: "text", text: "hi", state: "done" })

  assert.equal(withoutTrimmedParts([message])[0], message)
})
