import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"

import type { TaskSpec } from "./task-spec"

/**
 * Where a submitted plan's own artifacts live inside the game directory
 * (design.md decision 7: `.numa/` is reserved for harness-written artifacts;
 * decision 11: every write tool, scoped or unscoped, is rejected from ever
 * writing there — `lib/games/tools.ts`'s own protected-prefix guard). This
 * module is the one legitimate writer: harness code, called from
 * `submit_plan`'s own `execute` (`harness/tools/plan.ts`), never a tool a
 * model calls directly.
 */
const PLAN_DIR = ".numa"
const DESIGN_RELATIVE = `${PLAN_DIR}/design.md`
const TASKS_RELATIVE = `${PLAN_DIR}/tasks.json`

/**
 * Writes a submitted plan's two artifacts to the game's sandbox, the design
 * first and the tasks second — design.md's role-catalogue note on
 * `submit_plan`: "a task list never exists without the design it derives
 * from" (the spec's fixed phase order: design before tasks). `submit_plan`
 * calls this only after its own validation (`plan-validation.ts`) has
 * already passed, so a rejected submission never reaches the sandbox at
 * all — there is nothing to roll back if the second write never happens,
 * because the first only ever runs once validation already succeeded.
 *
 * `sandbox.fs.uploadFile`/`createFolder`, the same primitives
 * `lib/daytona/utils.ts`'s own `createGameSandbox` and
 * `lib/games/tools.ts`'s `createWriteFileTool` use to write into the game
 * directory.
 */
export async function writePlan(
  gameId: string,
  design: string,
  tasks: TaskSpec[]
): Promise<void> {
  const { sandbox } = await getGameSandbox(gameId)

  await sandbox.fs.createFolder(`${GAME_DIR}/${PLAN_DIR}`, "755").catch(() => {})

  await sandbox.fs.uploadFile(
    Buffer.from(design, "utf-8"),
    `${GAME_DIR}/${DESIGN_RELATIVE}`
  )

  await sandbox.fs.uploadFile(
    Buffer.from(JSON.stringify(tasks, null, 2), "utf-8"),
    `${GAME_DIR}/${TASKS_RELATIVE}`
  )
}
