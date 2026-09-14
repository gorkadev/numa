import { tool, type Tool } from "ai"
import { z } from "zod"

import { ALL_SKILL_NAMES, isSkillName, SKILLS } from "@/lib/games/skills/registry"

/**
 * `load_skill`'s own content cap (design.md decision 14, `agent-skills`
 * spec's `loadSkill` Fallback With Capped, Truncated Output requirement):
 * "≤ 6k chars, truncation marker". A skill's `body` is already bounded (the
 * biggest, `engine-reference`, is well under this), so in practice nothing
 * shipped today ever truncates — the cap exists for whatever skill content
 * gets added later, not to trim what exists now.
 */
const MAX_SKILL_CHARS = 6000

const TRUNCATION_MARKER =
  "\n\n[…truncated — this skill's content exceeds load_skill's 6,000-character cap. Ask the orchestrator to add it as a task skill for the full text, or work from what is included here.]"

/**
 * Caps `body` at `MAX_SKILL_CHARS` total, marker included — mirroring
 * `harness/envelope.ts`'s `renderEnvelope`: the marker is never itself cut
 * off, only the content ahead of it shrinks to make room.
 */
function cappedBody(body: string): { content: string; truncated: boolean } {
  if (body.length <= MAX_SKILL_CHARS) {
    return { content: body, truncated: false }
  }

  const keep = Math.max(0, MAX_SKILL_CHARS - TRUNCATION_MARKER.length)
  return { content: body.slice(0, keep) + TRUNCATION_MARKER, truncated: true }
}

/**
 * The `load_skill` fallback (design.md decision 14; role catalogue: every
 * role except explorer and verifier gets it, alongside its pushed default
 * skills). A worker's own defaults and any orchestrator-added task skills
 * are already inlined into its instructions — this tool is for the rare gap
 * neither covers, so a role never has to guess at a helper it was never
 * told about.
 *
 * Pure registry lookup: no filesystem access and no shell/bash tool
 * anywhere in this path (`agent-skills`'s No Shell Execution Exposed
 * requirement) — the skill text already lives in memory as a TS module
 * (`lib/games/skills/registry.ts`), so there is nothing to read from disk
 * or execute to answer this call.
 */
export function createLoadSkillTool(): Tool {
  return tool({
    description: [
      "Load a skill's full engine-reference text by name, for a skill not already included in your instructions.",
      "Use this only as a fallback: your instructions already carry your role's default skills, plus any extras the dispatching agent added for this task. Call this when you hit a real gap those do not cover — not to re-read a skill you already have.",
      `Valid skill names: ${ALL_SKILL_NAMES.join(", ")}.`,
    ].join(" "),
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .describe(`The skill to load. One of: ${ALL_SKILL_NAMES.join(", ")}.`),
    }),
    /**
     * A plain async function, not a generator: unlike a dispatch tool
     * (`explore.ts`, `run-tasks.ts`, `verify.ts`), there is no sub-agent run
     * to stream progress from — this resolves in one step, so the default
     * `toModelOutput` (JSON-stringify the result) is exactly what a caller
     * needs, with no truncation-safe rendering of its own to add on top.
     */
    execute: async ({ name }) => {
      if (!isSkillName(name)) {
        return {
          error: `Unknown skill "${name}". Valid skill names: ${ALL_SKILL_NAMES.join(", ")}.`,
        }
      }

      const { content, truncated } = cappedBody(SKILLS[name].body)

      return { name, body: content, truncated }
    },
  })
}
