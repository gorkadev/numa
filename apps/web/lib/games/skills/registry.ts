import type { RoleId } from "@/lib/games/harness/roles"

import { engineAudioSkill } from "./engine-audio"
import { engineCoreSkill } from "./engine-core"
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
}

export const ALL_SKILL_NAMES: SkillName[] = Object.keys(
  SKILLS,
) as SkillName[]

export function isSkillName(value: string): value is SkillName {
  return Object.hasOwn(SKILLS, value)
}

/**
 * Deterministic per-role skill defaults (agent-skills: Deterministic Role
 * Defaults — "MUST NOT depend on model choice at runtime"). This is a fixed
 * list per role, not a runtime computation:
 *
 * - `explorer` and `verifier` get none: the explorer only reads and
 *   summarises (its tools are `read_file`/`list_files`, design.md's role
 *   catalogue), and the verifier has no tools at all — neither writes
 *   engine code, so neither needs the engine reference pushed.
 * - `planner` gets `engine-core` only, matching design.md's role catalogue
 *   instructions column ("roles/planner, runtime, engine-core, skill
 *   index"): enough to plan tasks against what the engine already offers,
 *   without the full per-module reference a planner never writes code
 *   against directly.
 * - `gameplay`, `visuals` and `audio` each get `engine-core` plus the
 *   modules their focus actually calls, per design.md's worker row
 *   ("defaults ∪ task skills"):
 *   - `gameplay` (movement, physics, scoring): `engine-utils` (math/input),
 *     `engine-movement` (camera rigs/physics), `engine-systems`
 *     (state/phase machine, `createGame`).
 *   - `visuals` (look and feel): `engine-scene` (lighting/models),
 *     `engine-feedback` (tweening/HUD), `engine-systems` (fx/particles,
 *     shared with gameplay's state module), `engine-reference` (the style
 *     guidance section).
 *   - `audio`: `engine-audio` only, beyond core.
 *
 * This mapping is this unit's own reasonable default, not dictated
 * verbatim anywhere in design.md/tasks.md beyond the planner's explicit
 * `engine-core` mention — flagged in apply-progress as a deviation-style
 * note for the maintainer to adjust if a different split is wanted before
 * unit 7b wires this map into worker instructions.
 */
export const ROLE_DEFAULT_SKILLS: Record<RoleId, SkillName[]> = {
  explorer: [],
  planner: ["engine-core"],
  gameplay: ["engine-core", "engine-utils", "engine-movement", "engine-systems"],
  visuals: [
    "engine-core",
    "engine-scene",
    "engine-feedback",
    "engine-systems",
    "engine-reference",
  ],
  audio: ["engine-core", "engine-audio"],
  verifier: [],
}

/**
 * The orchestrator is not a `RoleId` (it never goes through
 * `run-subagent.ts`, `harness/roles.ts`'s own header comment), so its
 * default lives separately. Per design.md's File Changes table for unit 7
 * ("orchestrator keeps all engine skills pushed until unit 8, so the
 * prompt is identical"), it starts as every skill and is only cut down to
 * `engine-core` alone in unit 8 (task 8.5) once routing moves into the
 * workflow prompt.
 */
export const ORCHESTRATOR_DEFAULT_SKILLS: SkillName[] = ALL_SKILL_NAMES
