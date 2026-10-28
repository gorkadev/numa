import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

import type { Tool } from "ai"

import { DIMENSION_PROFILES, type GameDimension } from "@/lib/games/dimension"
import { taskSpecSchemaFor } from "@/lib/games/harness/task-spec"
import { createLoadSkillTool } from "@/lib/games/harness/tools/load-skill"
import { gameInstructionsFor } from "@/lib/games/instructions"
import { engineApiIndexFor } from "@/lib/games/instructions/engine-index"
import { runtimeInstructionsFor } from "@/lib/games/instructions/runtime"
import {
  mergeRuntimeSeeds,
  readRuntimeSeed,
  type RuntimeSeed,
} from "@/lib/games/runtime-seed"
import {
  SKILLS,
  skillBodies,
  skillIndex,
  type SkillName,
} from "@/lib/games/skills/registry"
import { getTemplate, TEMPLATES } from "@/lib/games/templates/catalog"
import { readTemplateSeed } from "@/lib/games/templates/seed"

/**
 * What a 3D game received on master before 2D existed, as sha256 hashes
 * (generated once from master's own code). Every 3D output below must still
 * hash to exactly these values: 3D games must not notice 2D was added.
 */
const MASTER = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "lib", "games", "dimension-3d.golden.json"),
    "utf8"
  )
) as {
  runtimeSeed: string
  templateSeeds: Record<string, string>
  engineApiIndex: string
  runtimeInstructions: string
  gameInstructions: { phasesOn: string; phasesOff: string }
  skillNames: string[]
  roleDefaultSkills: Record<string, string[]>
  roleSkillBodies: Record<string, string>
  orchestratorDefaultSkills: string[]
  skillIndex: string
  taskSkillsDescription: string
  loadSkillDescription: string
}

const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex")
const seedHash = (seed: RuntimeSeed) =>
  sha(
    JSON.stringify({
      folders: seed.folders,
      files: seed.files.map((file) => [file.relativePath, sha(file.contents)]),
    })
  )

async function loadSkill(dimension: GameDimension, name: string) {
  const tool = createLoadSkillTool(dimension) as Tool & {
    execute: (
      input: { name: string },
      options: unknown
    ) => Promise<{ error?: string; body?: string }>
  }
  return tool.execute({ name }, { toolCallId: "t", messages: [] })
}

const engineFiles = (seed: RuntimeSeed) =>
  seed.files
    .map((file) => file.relativePath)
    .filter((relativePath) => relativePath.startsWith("engine/"))
    .sort()

test("the catalog declares every template's dimension", () => {
  assert.deepEqual(
    Object.fromEntries(
      TEMPLATES.map((template) => [template.id, template.dimension])
    ),
    {
      none: "3d",
      "fantasy-cards": "3d",
      "cube-world": "3d",
      "toon-shooter": "3d",
      platformer: "3d",
      "tiny-swords": "2d",
    }
  )
})

const THREE_D_TEMPLATES = TEMPLATES.filter(
  (template) => template.dimension === "3d"
)

test("3D: the sandbox seed is master's, byte for byte, for every 3D template and none", async () => {
  const runtime = await readRuntimeSeed("3d")
  assert.equal(seedHash(runtime), MASTER.runtimeSeed)
  assert.equal(
    THREE_D_TEMPLATES.length,
    Object.keys(MASTER.templateSeeds).length
  )

  for (const template of THREE_D_TEMPLATES) {
    const seed = mergeRuntimeSeeds(
      await readRuntimeSeed(getTemplate(template.id).dimension),
      await readTemplateSeed(template.id, template.version)
    )
    assert.equal(seedHash(seed), MASTER.templateSeeds[template.id], template.id)
    assert.equal(engineFiles(seed).includes("engine/sprites.js"), false)
    assert.equal(engineFiles(seed).includes("engine/tilemap.js"), false)
  }
})

test("3D: engine API index, runtime instructions and orchestrator prompt are master's", () => {
  assert.equal(sha(engineApiIndexFor("3d")), MASTER.engineApiIndex)
  assert.equal(
    sha(runtimeInstructionsFor("3d").content),
    MASTER.runtimeInstructions
  )
  assert.equal(
    sha(JSON.stringify(gameInstructionsFor("3d", true))),
    MASTER.gameInstructions.phasesOn
  )
  assert.equal(
    sha(JSON.stringify(gameInstructionsFor("3d", false))),
    MASTER.gameInstructions.phasesOff
  )
})

test("3D: skills, role defaults, skill index and task-spec skills are master's", async () => {
  const profile = DIMENSION_PROFILES["3d"]
  assert.deepEqual(profile.skills, MASTER.skillNames)
  assert.deepEqual(profile.roleDefaultSkills, MASTER.roleDefaultSkills)
  assert.deepEqual(
    profile.orchestratorDefaultSkills,
    MASTER.orchestratorDefaultSkills
  )
  for (const [role, names] of Object.entries(profile.roleDefaultSkills)) {
    assert.equal(
      sha(skillBodies(names as readonly SkillName[])),
      MASTER.roleSkillBodies[role],
      role
    )
  }
  assert.equal(
    sha(skillIndex(profile.orchestratorDefaultSkills, profile.skills)),
    MASTER.skillIndex
  )
  assert.equal(
    sha(taskSpecSchemaFor(profile.skills).shape.skills.description ?? ""),
    MASTER.taskSkillsDescription
  )
  assert.equal(
    sha(createLoadSkillTool("3d").description as string),
    MASTER.loadSkillDescription
  )
})

test("3D: no 2D skill can be loaded or requested", async () => {
  const schema = taskSpecSchemaFor(DIMENSION_PROFILES["3d"].skills).shape.skills
  for (const name of ["engine-2d", "engine-core-2d"]) {
    assert.match(
      (await loadSkill("3d", name)).error ?? "",
      new RegExp(`Unknown skill "${name}"`)
    )
    assert.equal(schema.safeParse([name]).success, false, name)
  }
  assert.equal(typeof (await loadSkill("3d", "engine-scene")).body, "string")
})

test("2D: the sandbox gets the 2D toolkit and none of the 3D-only modules", async () => {
  const seed = await readRuntimeSeed("2d")
  assert.deepEqual(engineFiles(seed), [
    "engine/anim.js",
    "engine/engine.js",
    "engine/fx.js",
    "engine/hud.js",
    "engine/index.js",
    "engine/input.js",
    "engine/math.js",
    "engine/physics.js",
    "engine/sound.js",
    "engine/sprites.js",
    "engine/state.js",
    "engine/tilemap.js",
    "engine/touch.js",
  ])
  assert.equal(
    seed.files.some((file) => !file.relativePath.includes("/")),
    false,
    "no 3D starter page or logo"
  )
  assert.ok(
    seed.files.some(
      (file) => file.relativePath === "vendor/three/three.module.min.js"
    )
  )

  const anim3d = (await readRuntimeSeed("3d")).files.find(
    (file) => file.relativePath === "engine/anim.js"
  )
  const anim2d = seed.files.find(
    (file) => file.relativePath === "engine/anim.js"
  )
  assert.ok(
    anim3d && anim2d && anim2d.contents.equals(anim3d.contents),
    "anim.js is copied unchanged"
  )
})

test("2D: engine/index.js only imports modules the 2D sandbox has", async () => {
  const seed = await readRuntimeSeed("2d")
  const present = new Set(
    engineFiles(seed).map((file) => file.slice("engine/".length))
  )
  const index = seed.files
    .find((file) => file.relativePath === "engine/index.js")!
    .contents.toString("utf8")
  const imported = [...index.matchAll(/from "\.\/([^"]+)"/g)].map(
    (match) => match[1]!
  )

  assert.ok(imported.length > 0)
  for (const file of imported)
    assert.ok(present.has(file), `engine/index.js imports missing ${file}`)
  for (const file of ["sprites.js", "tilemap.js"])
    assert.ok(imported.includes(file), `re-exports ${file}`)
  assert.match(index, /export function createGame/)
})

test("2D: the API index lists the 2D toolkit without 3D-only exports", () => {
  const index = engineApiIndexFor("2d")
  for (const name of [
    "createSprite",
    "createTileLayer",
    "loadPixelTexture",
    "createPhysics",
    "tween",
    "createGame",
  ]) {
    assert.match(index, new RegExp(`\\b${name}\\b`), name)
  }
  for (const name of [
    "walkCycle",
    "createMixer",
    "addLighting",
    "engine/lighting.js",
    "engine/models.js",
    "engine/controls.js",
  ]) {
    assert.equal(index.includes(name), false, name)
  }
})

test("2D: runtime instructions describe the 2D toolkit", () => {
  const { content } = runtimeInstructionsFor("2d")
  assert.match(content, /sprites, tilemap/)
  assert.equal(content.includes("logo.svg"), false)
  assert.equal(content.includes("lighting"), false)
  assert.equal(content.includes("3D welcome screen"), false)
})

test("2D: skills are the 2D set, engine-2d is pushed by role, 3D-only skills are unreachable", async () => {
  const profile = DIMENSION_PROFILES["2d"]
  assert.deepEqual([...profile.skills].sort(), [
    "engine-2d",
    "engine-audio",
    "engine-core-2d",
    "engine-feedback",
    "engine-systems",
    "engine-utils",
  ])
  for (const role of ["planner", "gameplay", "visuals"] as const) {
    assert.ok(profile.roleDefaultSkills[role].includes("engine-2d"), role)
  }
  const pushed = [
    ...Object.values(profile.roleDefaultSkills).flat(),
    ...profile.orchestratorDefaultSkills,
  ]
  const index = skillIndex(profile.orchestratorDefaultSkills, profile.skills)
  const schema = taskSpecSchemaFor(profile.skills).shape.skills
  const loadSkillText = createLoadSkillTool("2d").description as string

  for (const name of [
    "engine-core",
    "engine-scene",
    "engine-movement",
    "engine-reference",
  ]) {
    assert.equal(pushed.includes(name as never), false, `${name} is not pushed`)
    assert.equal(index.includes(`\`${name}\``), false, `${name} is not indexed`)
    assert.equal(
      schema.safeParse([name]).success,
      false,
      `${name} is not requestable`
    )
    assert.equal(
      loadSkillText.includes(`${name},`) || loadSkillText.endsWith(`${name}.`),
      false,
      `${name} is not listed`
    )
    assert.match(
      (await loadSkill("2d", name)).error ?? "",
      new RegExp(`Unknown skill "${name}"`)
    )
  }
  assert.equal(schema.safeParse(["engine-2d"]).success, true)
  assert.equal(typeof (await loadSkill("2d", "engine-2d")).body, "string")

  const flagOff = JSON.stringify(gameInstructionsFor("2d", false))
  assert.ok(
    flagOff.includes(JSON.stringify(SKILLS["engine-2d"].body).slice(1, -1)),
    "flag off pushes engine-2d"
  )
  assert.equal(
    flagOff.includes(JSON.stringify(SKILLS["engine-scene"].body).slice(1, -1)),
    false
  )
})

test("2D: the 2D core and engine-2d skills teach 2D, within load_skill's cap", () => {
  const core = SKILLS["engine-core-2d"].body
  assert.match(core, /importmap/)
  assert.match(core, /orthographic/)
  assert.doesNotMatch(core, /from "\.\/engine\/(models|lighting|controls)\.js"/)
  for (const name of [
    "createGround",
    "PALETTE",
    "addLighting",
    "no GLTF, texture",
  ]) {
    assert.equal(core.includes(name), false, `core-2d avoids ${name}`)
  }

  const twoD = SKILLS["engine-2d"].body
  assert.match(twoD, /walkCycle/)
  assert.match(twoD, /createMixer/)
  assert.match(twoD, /createPhysics/)
  for (const body of [core, twoD]) assert.ok(body.length <= 6000)
})

test("2D: every 2D template ships its own starter page that loads on the 2D toolkit", async () => {
  const runtime = await readRuntimeSeed("2d")
  const twoD = TEMPLATES.filter((template) => template.dimension === "2d")
  assert.ok(twoD.length > 0)

  for (const template of twoD) {
    const seed = mergeRuntimeSeeds(
      runtime,
      await readTemplateSeed(template.id, template.version)
    )
    const page = seed.files.find((file) => file.relativePath === "index.html")
    assert.ok(page, `${template.id} ships index.html`)
    const html = page.contents.toString("utf8")
    assert.match(html, /"three": "\.\/vendor\/three\/three\.module\.min\.js"/)
    const local = [...html.matchAll(/(?:from |src=)"\.\/([^"]+)"/g)].map(
      (match) => match[1]!
    )
    for (const file of local) {
      assert.ok(
        seed.files.some((entry) => entry.relativePath === file),
        `${template.id} index.html loads missing ${file}`
      )
    }

    const manifest = JSON.parse(
      seed.files
        .find((file) => file.relativePath === "ASSETS.json")!
        .contents.toString("utf8")
    ) as {
      sprites: { path: string }[]
      tilesets: { path: string }[]
    }
    const declared = new Set(
      [...manifest.sprites, ...manifest.tilesets].map((asset) => asset.path)
    )
    const assets = [...html.matchAll(/\.\/(assets\/[^"')\s]+\.png)/g)].map(
      (match) => match[1]!
    )
    assert.ok(assets.length > 0)
    for (const asset of assets)
      assert.ok(
        declared.has(asset),
        `${template.id} index.html uses undeclared ${asset}`
      )
  }
})
