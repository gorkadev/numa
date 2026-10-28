import { engine2dSkill } from "./engine-2d"
import { engineAudioSkill } from "./engine-audio"
import { engineCoreSkill } from "./engine-core"
import { engineCore2dSkill } from "./engine-core-2d"
import { engineFeedbackSkill } from "./engine-feedback"
import { engineMovementSkill } from "./engine-movement"
import { engineReferenceSkill } from "./engine-reference"
import { engineSceneSkill } from "./engine-scene"
import { engineSystemsSkill } from "./engine-systems"
import { engineUtilsSkill } from "./engine-utils"

/**
 * The skills registry (design.md decision 14, `agent-skills` spec): the
 * always-loaded `instructions/engine.ts` guide, split into topic-scoped
 * modules so a role's instructions carry only what it needs instead of the
 * whole engine reference on every dispatch. Every entry's `body` was moved
 * verbatim from `engine.ts` (see each `engine-*.ts` file's own header
 * comment for its exact source line range) — nothing here is a rewrite.
 *
 * `SkillName` is closed on purpose: `load_skill` (unit 7b) validates a
 * requested name against this exact union and returns `{ error }` for
 * anything else (agent-skills: Unknown Skill Name Returns an Error).
 */
export type SkillName =
  | "engine-core"
  | "engine-utils"
  | "engine-movement"
  | "engine-scene"
  | "engine-feedback"
  | "engine-audio"
  | "engine-systems"
  | "engine-reference"
  | "engine-2d"
  | "engine-core-2d"

/**
 * A registry entry (agent-skills: Registry Entry Shape). `description` and
 * `trigger` are non-empty for every entry; `trigger` is the condition under
 * which the orchestrator should consider adding this skill as an extra
 * (`TaskSpec.skills`, unit 7b/8), not a machine-checked predicate.
 */
export type Skill = {
  name: SkillName
  description: string
  trigger: string
  body: string
}

export const SKILLS: Record<SkillName, Skill> = {
  "engine-core": engineCoreSkill,
  "engine-utils": engineUtilsSkill,
  "engine-movement": engineMovementSkill,
  "engine-scene": engineSceneSkill,
  "engine-feedback": engineFeedbackSkill,
  "engine-audio": engineAudioSkill,
  "engine-systems": engineSystemsSkill,
  "engine-reference": engineReferenceSkill,
  "engine-2d": engine2dSkill,
  "engine-core-2d": engineCore2dSkill,
}

/** Every registered skill, across both dimensions. Only stored data is checked against it; agents get their profile's list. */
export const ALL_SKILL_NAMES: SkillName[] = Object.keys(
  SKILLS,
) as SkillName[]

export function isSkillName(value: string): value is SkillName {
  return Object.hasOwn(SKILLS, value)
}

/*
 * Which of these skills a game's agents receive — pushed per role, pushed to
 * the orchestrator, listed, requestable or loadable — is decided by the
 * game's dimension profile (`lib/games/dimension.ts`), not here: a 3D game
 * never sees a 2D skill and a 2D game never sees a 3D-only one.
 */

/**
 * Joins a list of skills' `body` text in the order given, with the same
 * single blank-line separator `instructions/engine.ts`'s own sections used
 * (unit 7a's lossless-move verification confirmed this reconstructs the
 * original document byte-for-byte for the full 8-skill list). Shared by the
 * orchestrator's instructions (`instructions/index.ts`, either the
 * profile's orchestrator defaults or all of its skills depending on
 * `HARNESS_PHASES`) and a dispatched worker's (`harness/tools/run-tasks.ts`,
 * `mergeSkills` below), so both build a role's pushed skill text the exact
 * same way.
 */
export function skillBodies(names: readonly SkillName[]): string {
  return names.map((name) => SKILLS[name].body).join("\n\n")
}

/**
 * A role's default skills, plus any extra skills the dispatching agent
 * added for one task, deduplicated and in a stable order (`agent-skills`'s
 * Orchestrator-Selected Extra Skills requirement: "the extra skill's
 * content is included ... in addition to the role's defaults"). Defaults
 * come first, in the registry's own order; an extra already present in the
 * defaults is not pushed twice.
 */
export function mergeSkills(
  defaults: readonly SkillName[],
  extra: readonly SkillName[]
): SkillName[] {
  const merged = [...defaults]

  for (const name of extra) {
    if (!merged.includes(name)) merged.push(name)
  }

  return merged
}

/**
 * A short index of every skill NOT already pushed into a role's own
 * instructions — what `load_skill` (unit 7b) can still load for it by name,
 * beyond what it already carries. A role whose prompt does not name a skill
 * has no way to know it exists to ask for; this is what makes `load_skill`
 * a usable fallback rather than a tool nothing ever calls.
 *
 * Shared by the orchestrator's instructions (`instructions/index.ts`, unit
 * 8: pushed skills cut to `engine-core` alone) and the planner's
 * (`harness/tools/plan.ts`, unit 8: same single pushed skill) — both need
 * the same "what else is there" list, differing only in which names to
 * exclude. `available` is the game's dimension profile's skills, so the
 * index never names a skill that dimension cannot load.
 */
export function skillIndex(
  pushed: readonly SkillName[],
  available: readonly SkillName[]
): string {
  const remaining = available.filter((name) => !pushed.includes(name))

  if (remaining.length === 0) return ""

  return [
    "## Other engine skills",
    "load_skill can load any of these by name when work genuinely needs it, beyond what your instructions already carry:",
    ...remaining.map(
      (name) => `- \`${name}\` — ${SKILLS[name].description} Use when: ${SKILLS[name].trigger}`
    ),
  ].join("\n")
}
