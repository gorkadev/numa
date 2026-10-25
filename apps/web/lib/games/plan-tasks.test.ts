import assert from "node:assert/strict"
import { test } from "node:test"

import type { UIMessage } from "ai"

import { deriveTaskStrip } from "./plan-tasks"

type Part = UIMessage["parts"][number]

const body = (id: string, title: string, role = "gameplay") => ({ id, title, role, goal: "g", owns: [`${id}.js`] })

function assistant(...parts: unknown[]): UIMessage {
  return { id: crypto.randomUUID(), role: "assistant", parts: parts as Part[] }
}
const user: UIMessage = { id: "u", role: "user", parts: [{ type: "text", text: "go" }] }

function runTasks(tasks: object[], state = "input-available", output?: unknown): unknown {
  return { type: "tool-run_tasks", toolCallId: crypto.randomUUID(), state, input: { tasks }, ...(output ? { output } : {}) }
}

test("a dispatch the orchestrator wrote shows its tasks, pending until they report", () => {
  const strip = deriveTaskStrip([user, assistant(runTasks([body("t1", "Build the world"), body("t2", "Add sound", "audio")]))])
  assert.deepEqual(strip?.map(({ id, title, role, status }) => ({ id, title, role, status })), [
    { id: "t1", title: "Build the world", role: "gameplay", status: "pending" },
    { id: "t2", title: "Add sound", role: "audio", status: "pending" },
  ])
})

test("finished outcomes mark the dispatched tasks done or failed", () => {
  const output = { outcomes: [
    { taskId: "t1", envelope: { status: "done" } },
    { taskId: "t2", envelope: { status: "partial" } },
  ] }
  const strip = deriveTaskStrip([user, assistant(runTasks([body("t1", "A"), body("t2", "B")], "output-available", output))])
  assert.deepEqual(strip?.map((task) => task.status), ["done", "failed"])
})

test("several dispatches in one turn add up to one list", () => {
  const strip = deriveTaskStrip([user, assistant(
    runTasks([body("t1", "A")], "output-available", { outcomes: [{ taskId: "t1", envelope: { status: "done" } }] }),
    runTasks([body("t2", "B")])
  )])
  assert.deepEqual(strip?.map((task) => `${task.id}:${task.status}`), ["t1:done", "t2:pending"])
})

test("a later turn's dispatch replaces the earlier turn's list", () => {
  const strip = deriveTaskStrip([
    user, assistant(runTasks([body("t1", "Old")])),
    user, assistant(runTasks([body("f1", "Fix")])),
  ])
  assert.deepEqual(strip?.map((task) => task.id), ["f1"])
})

test("a thread whose build went through the old planner still shows the plan's tasks", () => {
  const plan = { type: "tool-plan", toolCallId: "p", state: "output-available", input: { brief: "b" }, output: { tasks: [{ id: "t1", title: "Planned", role: "visuals" }] } }
  const dispatch = { type: "tool-run_tasks", toolCallId: "r", state: "output-available", input: { taskIds: ["t1"] }, output: { outcomes: [{ taskId: "t1", envelope: { status: "done" } }] } }
  const strip = deriveTaskStrip([user, assistant(plan, dispatch)])
  assert.deepEqual(strip?.map((task) => `${task.title}:${task.status}`), ["Planned:done"])
})

test("a thread with no dispatch shows no strip", () => {
  assert.equal(deriveTaskStrip([user, assistant({ type: "text", text: "Hi" })]), undefined)
})

test("a batch run_tasks rejected before starting is not part of the list", () => {
  const rejected = runTasks([body("gameplay", "A"), body("hud", "B")], "output-available", { error: "overlapping ownership" })
  const accepted = runTasks([body("game", "C")], "output-available", { outcomes: [{ taskId: "game", envelope: { status: "done" } }] })
  const strip = deriveTaskStrip([user, assistant(rejected, accepted)])
  assert.deepEqual(strip?.map((task) => `${task.id}:${task.status}`), ["game:done"])
})
