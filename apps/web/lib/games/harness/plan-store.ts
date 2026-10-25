import { DaytonaFileNotFoundError } from "@daytona/sdk"
import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"

import {
  parsePlanTasksArtifact,
  parseStoredPlanArtifact,
  PLAN_READINESS_POLICY_VERSION,
  type AssetReceipt,
  type PlanAssessment,
  type StoredPlan,
} from "./plan-validation"
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
const PLAN_RELATIVE = `${PLAN_DIR}/plan.json`

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
  tasks: TaskSpec[],
  assessment: PlanAssessment,
  requiresAssetReceipt: boolean
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

  await sandbox.fs.uploadFile(
    Buffer.from(JSON.stringify({
      assessment,
      ...(requiresAssetReceipt && assessment.assetReceipt
        ? { readinessPolicyVersion: PLAN_READINESS_POLICY_VERSION }
        : {}),
    }, null, 2), "utf-8"),
    `${GAME_DIR}/${PLAN_RELATIVE}`
  )
}

/** Re-export pure parsers for callers that need no sandbox. */
export const parsePlanTasks = parsePlanTasksArtifact
export const parseStoredPlan = parseStoredPlanArtifact
export type { StoredPlan }

/**
 * Reads back the plan `submit_plan` last accepted for this game, so
 * `run_tasks` (unit 10b) can validate a dispatched batch against it.
 *
 * The sandbox file is the source of truth rather than an in-memory
 * turn-scoped value: `submit_plan`'s own accepted submission
 * (`harness/tools/plan.ts`'s `takeSubmission`) lives only inside that one
 * `plan` tool call's closure, and `turnState` (`./turn-state.ts`) carries no
 * "last accepted plan" field of its own — adding one would duplicate what
 * this file already writes and risk drifting from it. Reading the file
 * `writePlan` wrote is therefore the only cross-call source of truth
 * available today, and it is cheap: one small JSON download per `run_tasks`
 * call.
 *
 * `undefined` when no plan has ever been submitted for this game (no
 * `.numa/tasks.json` yet — the `DaytonaFileNotFoundError` case `writePlan`'s
 * own sibling reader, `lib/daytona/verify.ts`'s `readVerifyBaseline`, also
 * special-cases) or when the file does not parse as a task list. The latter
 * should not happen for a file only `writePlan` ever writes, but a caller
 * reacting to "no valid plan" rather than throwing keeps a corrupted file
 * from crashing a turn outright.
 */
export async function readPlanTasks(gameId: string): Promise<TaskSpec[] | undefined> {
  const { sandbox } = await getGameSandbox(gameId)

  let raw: Buffer
  try {
    raw = await sandbox.fs.downloadFile(`${GAME_DIR}/${TASKS_RELATIVE}`)
  } catch (error) {
    if (error instanceof DaytonaFileNotFoundError) return undefined
    throw error
  }

  return parsePlanTasksArtifact(raw.toString("utf-8"))
}

/** Reads only receipts explicitly enrolled in the host-owned readiness policy. */
export async function readPlanAssetReceipt(gameId: string): Promise<AssetReceipt | undefined> {
  const { sandbox } = await getGameSandbox(gameId)

  let raw: Buffer
  try {
    raw = await sandbox.fs.downloadFile(`${GAME_DIR}/${PLAN_RELATIVE}`)
  } catch (error) {
    if (error instanceof DaytonaFileNotFoundError) return undefined
    throw error
  }

  const plan = parseStoredPlanArtifact(raw.toString("utf-8"))
  return plan?.readinessPolicyVersion === PLAN_READINESS_POLICY_VERSION
    ? plan.assetReceipt
    : undefined
}

/**
 * Records the eager-asset selection a fresh selected-template build declared
 * through `run_tasks`, in the same `plan.json` `verify` reads it from
 * (`readPlanAssetReceipt`). Replaces whatever an earlier plan left there, so
 * a stale receipt never outlives the build that declares a new one.
 */
export async function writeDispatchReceipt(
  gameId: string,
  receipt: AssetReceipt
): Promise<void> {
  const { sandbox } = await getGameSandbox(gameId)

  await sandbox.fs.createFolder(`${GAME_DIR}/${PLAN_DIR}`, "755").catch(() => {})
  await sandbox.fs.uploadFile(
    Buffer.from(JSON.stringify({
      assetReceipt: receipt,
      readinessPolicyVersion: PLAN_READINESS_POLICY_VERSION,
    }, null, 2), "utf-8"),
    `${GAME_DIR}/${PLAN_RELATIVE}`
  )
}
