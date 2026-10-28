import assert from "node:assert/strict"
import { test } from "node:test"

import { taskSpecSchema } from "@/lib/games/harness/task-spec"

import { isSkillName, ROLE_DEFAULT_SKILLS, ORCHESTRATOR_DEFAULT_SKILLS, SKILLS, skillIndex } from "./registry"

test("engine-2d is a registered skill that teaches the 2D modules", () => {
  assert.equal(isSkillName("engine-2d"), true)
  const { body } = SKILLS["engine-2d"]
  for (const api of ["createSprite", "loadPixelTexture", "createTileLayer", "autotile16", "setSpriteDepth", "orthographic"]) {
    assert.ok(body.includes(api), `engine-2d mentions ${api}`)
  }
  assert.ok(body.length <= 6000, "fits load_skill's cap without truncation")
})

test("engine-2d is never pushed by default, so 3D games pay nothing for it", () => {
  for (const defaults of [...Object.values(ROLE_DEFAULT_SKILLS), ORCHESTRATOR_DEFAULT_SKILLS]) {
    assert.equal(defaults.includes("engine-2d"), false)
  }
  assert.ok(skillIndex(ORCHESTRATOR_DEFAULT_SKILLS).includes("`engine-2d`"), "but load_skill can find it")
})

test("a task can ask for engine-2d as an extra skill", () => {
  const task = {
    id: "map",
    role: "visuals",
    title: "Island map",
    goal: "Build the island tile map.",
    owns: ["src/map.js"],
    skills: ["engine-2d"],
  }
  const parsed = taskSpecSchema.safeParse(task)
  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message)
})
