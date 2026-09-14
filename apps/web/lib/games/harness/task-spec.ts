import { z } from "zod"

import { ALL_SKILL_NAMES } from "@/lib/games/skills/registry"

/**
 * One task's declared shape (design.md's Interfaces section): submitted by
 * the planner's `submit_plan` (unit 8, `harness/tools/plan.ts`) and consumed
 * again by `run_tasks` (unit 3, `harness/tools/run-tasks.ts`) — the exact
 * same schema both tools validate against, so a plan's own tasks are already
 * shaped for a later `run_tasks` call to dispatch without re-shaping them.
 *
 * Moved out of `run-tasks.ts` in unit 8 rather than duplicated there:
 * `run-tasks.ts` itself imports `harness/ownership.ts`, which imports
 * `lib/games/tools.ts`, which imports the Daytona/database client chain —
 * pulling that chain in just to validate a plan's own task shape would need
 * a live sandbox and database connection for what is otherwise a pure
 * structural check. This module has none of that: zod plus the skills
 * registry's own plain data, so `submit_plan`'s validator
 * (`harness/plan-validation.ts`) can be exercised standalone, with no
 * sandbox or database in the loop.
 */
export const taskSpecSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('A short id for this task, stable within the turn, e.g. "t1".'),
  role: z.enum(["gameplay", "visuals", "audio"]),
  title: z.string().min(1).describe("A few words naming the task."),
  goal: z
    .string()
    .min(1)
    .max(1200)
    .describe(
      "The task's goal, procedure, constraints and done-when condition, in plain language. This is the worker's whole brief — write it as if the worker has read nothing else about the game."
    ),
  owns: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'File paths this task may write. A directory ending in "/" owns everything under it; anything else must match exactly.'
    ),
  dependsOn: z
    .array(z.string())
    .default([])
    .describe(
      "Ids of other tasks that must finish before this one starts — from this same batch, or from an earlier run_tasks call in this same turn. A dependency this call cannot resolve (an unknown id, a self-dependency, or a dependency cycle) blocks the task instead of running it."
    ),
  skills: z
    .array(z.enum(ALL_SKILL_NAMES))
    .default([])
    .describe(
      `Extra skills to push into this worker's instructions on top of its role's defaults, when this task needs one its role does not already carry. One or more of: ${ALL_SKILL_NAMES.join(", ")}.`
    ),
})

export type TaskSpec = z.infer<typeof taskSpecSchema>

/**
 * Rejects a batch with two tasks sharing an id at input, before dispatch —
 * shared by `run_tasks`' own batch schema (`tools/run-tasks.ts`) and
 * `submit_plan`'s (`harness/plan-validation.ts`), both keyed by task id in
 * their own bookkeeping. A duplicate would silently overwrite one task's
 * slot with the other's, so the second task would never run (or, for a
 * plan, never be distinguishable from the first) — surfaced as a correctable
 * schema error, the same channel every other input violation on these tools
 * already uses.
 */
export function rejectDuplicateTaskIds(
  tasks: TaskSpec[],
  ctx: z.RefinementCtx
): void {
  const seenAt = new Map<string, number>()

  tasks.forEach((task, index) => {
    const firstIndex = seenAt.get(task.id)

    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [index, "id"],
        message: `Duplicate task id "${task.id}" (already used by task ${firstIndex}) — every task id must be unique in this call.`,
      })
      return
    }

    seenAt.set(task.id, index)
  })
}
