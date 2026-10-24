import assert from "node:assert/strict"
import { test } from "node:test"

import { noWritesEnvelope, retryPromptAfterNoWrites, wroteNothing } from "./worker-outcome"

const done = { agent: "t1:abc", status: "done" as const, summary: "" }

test("a worker that finished without writing any of its files wrote nothing", () => {
  assert.equal(wroteNothing({ envelope: done, edits: [] }), true)
})

test("a worker that wrote a file is a normal finish", () => {
  assert.equal(wroteNothing({ envelope: done, edits: ["game.js"] }), false)
})

test("a worker that already failed or was cut short is left to its own status", () => {
  for (const status of ["partial", "error", "aborted", "blocked"] as const) {
    assert.equal(wroteNothing({ envelope: { ...done, status }, edits: [] }), false)
  }
})

test("a worker that still wrote nothing after its retry is reported partial, with the reason", () => {
  const envelope = noWritesEnvelope({ ...done, summary: "All set." }, ["index.html", "game.js"])

  assert.equal(envelope.status, "partial")
  assert.equal(envelope.agent, "t1:abc")
  assert.match(envelope.summary, /without writing any of its files \(index\.html, game\.js\)/)
  assert.match(envelope.summary, /All set\./)
})

test("the retry prompt keeps the task and tells the worker to write its files now", () => {
  const prompt = retryPromptAfterNoWrites("## Task: Build it", ["game.js"])

  assert.ok(prompt.startsWith("## Task: Build it"))
  assert.match(prompt, /previous attempt ended without writing/)
  assert.match(prompt, /game\.js/)
})
