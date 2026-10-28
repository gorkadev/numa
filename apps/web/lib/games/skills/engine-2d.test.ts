import assert from "node:assert/strict"
import { test } from "node:test"

import { DIMENSION_PROFILES } from "@/lib/games/dimension"
import { taskSpecSchemaFor } from "@/lib/games/harness/task-spec"

import { isSkillName, SKILLS } from "./registry"

test("engine-2d is a registered skill that teaches the 2D modules", () => {
  assert.equal(isSkillName("engine-2d"), true)
  const { body } = SKILLS["engine-2d"]
  for (const api of ["createSprite", "loadPixelTexture", "createTileLayer", "autotile16", "setSpriteDepth", "orthographic"]) {
    assert.ok(body.includes(api), `engine-2d mentions ${api}`)
  }
  assert.ok(body.length <= 6000, "fits load_skill's cap without truncation")
})

test("engine-2d is never offered to a 3D game", () => {
  const profile = DIMENSION_PROFILES["3d"]
  for (const defaults of [...Object.values(profile.roleDefaultSkills), profile.orchestratorDefaultSkills]) {
    assert.equal((defaults as readonly string[]).includes("engine-2d"), false)
  }
  assert.equal((profile.skills as readonly string[]).includes("engine-2d"), false)
})

test("a 2D task can ask for engine-2d as an extra skill", () => {
  const task = {
    id: "map",
    role: "visuals",
    title: "Island map",
    goal: "Build the island tile map.",
    owns: ["src/map.js"],
    skills: ["engine-2d"],
  }
  const parsed = taskSpecSchemaFor(DIMENSION_PROFILES["2d"].skills).safeParse(task)
  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message)
})
