import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Blobatar } from "@blobatar/react"
import { happy, idle, sad, sleepy, thinking, unsure } from "blobatar/expression"

import { agentBotPresentation } from "./agent-bot-presentation.ts"

test("each specialist has a stable explicit identity independent of status", () => {
  const identities = [
    ["explorer", 174, 0.35],
    ["planner", 270, 0.93],
    ["gameplay", 215, 0.54],
    ["visuals", 12, 0.965],
    ["audio", 40, 0.89],
    ["verifier", 140, 0.65],
  ] as const
  for (const [role, hue, shape] of identities) {
    const running = agentBotPresentation(role, "running")
    assert.equal(running.name, `numa-agent-${role}`)
    assert.equal(running.hue, hue)
    assert.equal(running.tone, 0.4)
    assert.deepEqual(running.traits, { shape })
    for (const status of ["done", "partial", "blocked", "error", "aborted", "skipped", "unavailable"] as const) {
      const terminal = agentBotPresentation(role, status)
      assert.equal(terminal.name, running.name)
      assert.equal(terminal.hue, hue)
      assert.deepEqual(terminal.traits, running.traits)
    }
  }
})

/** Exercise the installed renderer without a JSX runner or browser framework. */
test("animated avatars render locally as decorative square SVGs with persistent poses", () => {
  const render = (status: Parameters<typeof agentBotPresentation>[1]) =>
    renderToStaticMarkup(createElement(Blobatar, {
      ...agentBotPresentation("planner", status), size: 32,
    }))
  const done = render("done")
  assert.match(done, /^<svg /)
  assert.match(done, /width="32" height="32"/)
  assert.match(done, /aria-hidden="true"/)
  assert.doesNotMatch(done, /<title|<img|https?:\/\/(?!www.w3.org)/)
  assert.notEqual(done, render("aborted"), "happy remains distinct from idle in hover mode")
  assert.notEqual(done, render("running"), "running carries a different pose and motion mode")
  assert.equal(done, render("done"), "SSR output remains deterministic")
})

test("all statuses retain their expression and only running animates continuously", () => {
  const expressions = { running: thinking, done: happy, partial: unsure, blocked: unsure, error: sad, aborted: idle, skipped: idle, unavailable: sleepy }
  for (const status of Object.keys(expressions) as (keyof typeof expressions)[]) {
    const props = agentBotPresentation("explorer", status)
    assert.equal(props.expression, expressions[status])
    assert.equal(props.animate, status === "running" ? "always" : "hover")
  }
})
