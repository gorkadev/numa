import type { RoleId } from "@/lib/games/harness/roles"
import type { SkillName } from "@/lib/games/skills/registry"

/**
 * Whether a game is drawn in 2D or 3D. Declared per template in the catalog
 * (`templates/catalog.ts`), never inferred from a template's assets: we
 * decide how a kit is meant to be built.
 */
export type GameDimension = "2d" | "3d"

/**
 * Everything the agent receives that depends on the game's dimension. A
 * game's dimension picks one profile, and every consumer reads from it
 * rather than branching on the dimension itself.
 */
export type DimensionProfile = {
  /**
   * The sandbox's `engine/` files, as sandbox file name → source file name
   * inside `runtime/engine/`. Nothing else under `runtime/engine/` is copied.
   */
  engineFiles: Readonly<Record<string, string>>
  /** Files at the root of `runtime/` copied into the sandbox: the starter page and what it needs. */
  starterFiles: readonly string[]
  /** Exports left out of the engine API index because they do not apply to this dimension. */
  apiIndexOmit: readonly string[]
  /** The "fresh game directory" listing in the runtime instructions. */
  freshDirectory: string
  /** Every skill this dimension's agents may be given, list, enumerate or load, in that order. */
  skills: readonly SkillName[]
  /** Skills pushed into each role's instructions without anyone asking. */
  roleDefaultSkills: Readonly<Record<RoleId, readonly SkillName[]>>
  /** Skills pushed into the orchestrator's own instructions when harness phases are on. */
  orchestratorDefaultSkills: readonly SkillName[]
}

/** Engine files shared by name between both dimensions. */
const SHARED_ENGINE_FILES = [
  "anim.js",
  "engine.js",
  "fx.js",
  "hud.js",
  "input.js",
  "math.js",
  "physics.js",
  "sound.js",
  "state.js",
  "touch.js",
] as const

const sameName = (names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, name]))

export const DIMENSION_PROFILES = {
  "3d": {
    engineFiles: sameName([
      ...SHARED_ENGINE_FILES,
      "controls.js",
      "index.js",
      "lighting.js",
      "models.js",
    ]),
    starterFiles: ["index.html", "logo.svg"],
    apiIndexOmit: [],
    freshDirectory: `index.html      the page the player loads — a 3D welcome screen until you replace it
logo.svg        the numa mark, used by that welcome screen
engine/         the game toolkit: engine, input, controls, physics, models,
                lighting, anim, hud, sound, fx, state, math`,
    skills: [
      "engine-core",
      "engine-utils",
      "engine-movement",
      "engine-scene",
      "engine-feedback",
      "engine-audio",
      "engine-systems",
      "engine-reference",
    ],
    roleDefaultSkills: {
      explorer: [],
      planner: ["engine-core"],
      gameplay: [
        "engine-core",
        "engine-utils",
        "engine-movement",
        "engine-systems",
      ],
      visuals: [
        "engine-core",
        "engine-scene",
        "engine-movement",
        "engine-feedback",
        "engine-systems",
        "engine-reference",
      ],
      audio: ["engine-core", "engine-audio"],
      verifier: [],
    },
    orchestratorDefaultSkills: ["engine-core"],
  },
  "2d": {
    /**
     * No lighting, models or controls: sprites and tiles are unlit, the art
     * comes from the template, and the camera is a flat orthographic one.
     * `index.js` has its own source because the 3D one imports `lighting.js`
     * statically and would fail to load without it.
     */
    engineFiles: {
      ...sameName([...SHARED_ENGINE_FILES, "sprites.js", "tilemap.js"]),
      "index.js": "index-2d.js",
    },
    /** A 2D template ships its own starter page; the 3D welcome screen does not apply. */
    starterFiles: [],
    /** `walkCycle` drives a 3D character rig and `createMixer` glTF clips; neither has anything to act on in 2D. */
    apiIndexOmit: ["walkCycle", "createMixer"],
    freshDirectory: `index.html      the page the player loads — the template's 2D welcome screen until you replace it
engine/         the 2D game toolkit: engine, input, physics, sprites, tilemap,
                anim, hud, sound, fx, state, math`,
    skills: [
      "engine-core-2d",
      "engine-2d",
      "engine-utils",
      "engine-feedback",
      "engine-audio",
      "engine-systems",
    ],
    roleDefaultSkills: {
      explorer: [],
      planner: ["engine-core-2d", "engine-2d"],
      gameplay: [
        "engine-core-2d",
        "engine-2d",
        "engine-utils",
        "engine-systems",
      ],
      visuals: [
        "engine-core-2d",
        "engine-2d",
        "engine-feedback",
        "engine-systems",
      ],
      audio: ["engine-core-2d", "engine-audio"],
      verifier: [],
    },
    orchestratorDefaultSkills: ["engine-core-2d"],
  },
} as const satisfies Record<GameDimension, DimensionProfile>
