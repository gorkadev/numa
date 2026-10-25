import { z } from "zod"

import { rejectDuplicateTaskIds, taskSpecSchema, type TaskSpec } from "./task-spec"

/**
 * design.md's role catalogue: `submit_plan` accepts at most 6 tasks — a
 * different, larger ceiling than `run_tasks`' own `MAX_TASKS_PER_BATCH` (4),
 * which caps one dispatch call, not a whole plan.
 */
export const MAX_PLAN_TASKS = 6

/**
 * The count/role/skill/duplicate-id half of `submit_plan`'s validation
 * (task 8.1: "validates ≤ 6 tasks, known roles and skills"): everything
 * expressible as a static zod schema, reusing the exact per-task shape
 * `run_tasks` itself dispatches against (`../task-spec.ts`) so a plan's own
 * tasks never need re-shaping before a later `run_tasks` call. A violation
 * here — too many tasks, an unknown role or skill, a duplicate id — is a
 * schema failure, the same channel `run_tasks`' own `tasksArraySchema`
 * already uses (unit 3/8): a correctable tool-input problem, not a thrown
 * error, so the planner's own loop can react to it and retry.
 *
 * The cross-task graph checks below it — acyclic `dependsOn`, no owns entry
 * under a protected prefix, disjoint ownership outside dependency chains —
 * cannot be expressed as a static schema, so `validatePlanTasks` (below)
 * checks them explicitly and `submit_plan`'s own `execute`
 * (`harness/tools/plan.ts`) returns `{ error }` for them directly, per
 * design.md's own wording for this paragraph. Both paths reach the planner
 * as a correctable problem inside its own loop either way.
 */
export const planTasksSchema = z
  .array(taskSpecSchema)
  .min(1)
  .max(MAX_PLAN_TASKS)
  .superRefine(rejectDuplicateTaskIds)

/**
 * The directories no task may ever declare owning (design.md decision 7/11,
 * 12), whatever `run_tasks` would otherwise allow. Duplicated as string
 * literals rather than imported from `lib/games/tools.ts`'s own
 * (unexported) `PROTECTED_DIR_NAMES` constant: that module imports the
 * Daytona SDK and `@workspace/db` transitively (through
 * `lib/daytona/utils.ts`), which a plan-submission validator — a pure
 * structural check over already-parsed task specs, with no sandbox or
 * database of its own — has no reason to depend on. The write-time guard in
 * `tools.ts` still applies as a second, code-level line regardless of what a
 * task declares (decision 11: "checks run in order, protected prefix first,
 * then ownership").
 */
const PROTECTED_DIR_NAMES = ["engine", "vendor", ".numa"] as const

function isProtectedOwnership(entry: string): boolean {
  return PROTECTED_DIR_NAMES.some(
    (dir) => entry === dir || entry.startsWith(`${dir}/`)
  )
}

/**
 * Whether two declared ownership entries conflict — duplicated from
 * `harness/ownership.ts`'s own `entriesConflict`/`ownershipOverlaps` rather
 * than imported, for the same reason `PROTECTED_DIR_NAMES` above is
 * duplicated rather than imported: `ownership.ts` also exports
 * `createScopedGameTools`, which pulls in the same Daytona/database import
 * chain. The rule itself is identical and must stay so: an entry is either
 * an exact file path or a directory prefix ending in "/", and two entries
 * conflict when they are equal or one is a directory prefix of the other
 * (design.md decision 12).
 */
function entriesConflict(a: string, b: string): boolean {
  if (a === b) return true
  if (a.endsWith("/") && b.startsWith(a)) return true
  if (b.endsWith("/") && a.startsWith(b)) return true
  return false
}

function ownershipOverlaps(a: readonly string[], b: readonly string[]): boolean {
  return a.some((entryA) => b.some((entryB) => entriesConflict(entryA, entryB)))
}

/**
 * The first task whose `dependsOn` names an id that is not one of this
 * plan's own tasks. A fresh plan submission has no earlier `run_tasks` call
 * to have finished yet this turn (the planner runs before any dispatch), so
 * — unlike `run_tasks`' own cross-call `dependsOn` (`turnState.isTaskFinished`,
 * unit 4) — every dependency a submitted plan names must resolve within the
 * same submission.
 */
export function findUnknownDependency(
  tasks: readonly TaskSpec[],
  finishedIds: ReadonlySet<string> = new Set()
): { taskId: string; missing: string } | undefined {
  const ids = new Set(tasks.map((task) => task.id))

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep) && !finishedIds.has(dep)) return { taskId: task.id, missing: dep }
    }
  }

  return undefined
}

/**
 * The first dependency cycle found among the plan's own tasks, as the
 * ordered chain of ids that forms it — including a task depending on
 * itself, a one-node cycle. A three-color DFS (unvisited / visiting / done):
 * reaching a `"visiting"` id again means the current DFS stack, from that id
 * onward, is the cycle. `run_tasks`' own scheduler (unit 3/4) never needed
 * this: an unsatisfiable dependency, cycle included, simply never becomes
 * startable and is rejected once nothing else is ready — sufficient for a
 * runtime scheduler, but it never names the cycle, which a pre-dispatch
 * validator has to explain to the model in `{ error }` before anything
 * (`submit_plan` writes `.numa/design.md`/`tasks.json` — trying to find a
 * cycle after that write would be too late).
 */
export function findDependencyCycle(
  tasks: readonly TaskSpec[]
): string[] | undefined {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const state = new Map<string, "visiting" | "done">()
  const stack: string[] = []

  function visit(id: string): string[] | undefined {
    const status = state.get(id)

    if (status === "done") return undefined

    if (status === "visiting") {
      const cycleStart = stack.indexOf(id)
      return [...stack.slice(cycleStart), id]
    }

    const task = byId.get(id)
    if (!task) return undefined // an unknown id is reported separately, by findUnknownDependency

    state.set(id, "visiting")
    stack.push(id)

    for (const dep of task.dependsOn) {
      const cycle = visit(dep)
      if (cycle) return cycle
    }

    stack.pop()
    state.set(id, "done")
    return undefined
  }

  for (const task of tasks) {
    const cycle = visit(task.id)
    if (cycle) return cycle
  }

  return undefined
}

/**
 * Every task id reachable from `taskId` by following `dependsOn` edges
 * transitively — "everything this task will not start before." Used only to
 * decide whether two overlapping-ownership tasks have a real ordering
 * between them (below); an unknown dependency id is skipped here, since
 * `findUnknownDependency` already reports it on its own, and a true cycle
 * cannot occur once `findDependencyCycle` has already rejected the plan
 * ahead of this call (`validatePlanTasks` runs the checks in that order).
 */
function transitiveDependencies(
  tasks: readonly TaskSpec[]
): Map<string, Set<string>> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const cache = new Map<string, Set<string>>()

  function resolve(id: string): Set<string> {
    const cached = cache.get(id)
    if (cached) return cached

    // Defensive only: a real cycle is rejected before this function is ever called.
    cache.set(id, new Set())

    const result = new Set<string>()
    const task = byId.get(id)

    if (task) {
      for (const dep of task.dependsOn) {
        if (!byId.has(dep)) continue
        result.add(dep)
        for (const transitive of resolve(dep)) result.add(transitive)
      }
    }

    cache.set(id, result)
    return result
  }

  const map = new Map<string, Set<string>>()
  for (const task of tasks) map.set(task.id, resolve(task.id))
  return map
}

/**
 * The first pair of tasks whose declared ownership overlaps with no
 * `dependsOn` relationship between them, in either direction — design.md's
 * "disjoint ownership outside dependency chains". A dependency guarantees
 * `run_tasks`' own scheduler never runs the two concurrently (unit 3/4's
 * `canStart`), so an overlap is only ever safe when one task is already
 * ordered before the other; an overlap with no such ordering is rejected
 * at plan-submission time rather than left for the scheduler to silently
 * serialize.
 */
export function findUnresolvedOwnershipOverlap(
  tasks: readonly TaskSpec[]
): [string, string] | undefined {
  const closures = transitiveDependencies(tasks)

  for (const [i, a] of tasks.entries()) {
    for (const b of tasks.slice(i + 1)) {
      if (!ownershipOverlaps(a.owns, b.owns)) continue

      const aDependsOnB = closures.get(a.id)?.has(b.id) ?? false
      const bDependsOnA = closures.get(b.id)?.has(a.id) ?? false

      if (!aDependsOnB && !bDependsOnA) return [a.id, b.id]
    }
  }

  return undefined
}

/**
 * The cross-task business-logic checks `planTasksSchema` cannot express
 * (see that constant's own comment): acyclic `dependsOn` (unknown ids and
 * true cycles both checked), no owns entry under a protected prefix, and
 * disjoint ownership outside dependency chains. Returns the first violation
 * found, as the exact message `submit_plan`'s `execute`
 * (`harness/tools/plan.ts`) returns as `{ error }`, or `undefined` for a
 * plan that passes every check.
 *
 * Assumes `tasks` has already passed `planTasksSchema` (task count, known
 * roles/skills, unique ids) — this function only adds the checks a static
 * schema cannot make. Pure and side-effect-free: no sandbox, database or AI
 * SDK import anywhere in this module, so it can be exercised standalone
 * (e.g. a Node script constructing task lists by hand) without a live
 * sandbox or database connection.
 */
export const assetReceiptSchema = z
  .object({
    eagerModelIds: z.array(z.string().min(1)).min(1).max(6),
    lazyModelIds: z.array(z.string().min(1)).optional(),
    eagerSharedAssetIds: z.array(z.string().min(1)),
  })
  .strict()

const cohesiveAssessmentSchema = z
  .object({
    classification: z.literal("cohesive"),
    rationale: z.string().min(1).max(1200).describe("Why the work is split this way, at most 1200 characters."),
    assetReceipt: assetReceiptSchema.optional(),
  })
  .strict()

const substantialAssessmentSchema = z
  .object({
    classification: z.literal("substantial"),
    rationale: z.string().min(1).max(1200).describe("Why the work is split this way, at most 1200 characters."),
    integrationTaskId: z.string().min(1),
    assetReceipt: assetReceiptSchema.optional(),
  })
  .strict()

/** The planner's explicit, auditable judgment about task cohesion and asset selection. */
export const planAssessmentSchema = z.discriminatedUnion("classification", [
  cohesiveAssessmentSchema,
  substantialAssessmentSchema,
])

export type AssetReceipt = z.infer<typeof assetReceiptSchema>
export type PlanAssessment = z.infer<typeof planAssessmentSchema>
export const PLAN_READINESS_POLICY_VERSION = 1 as const
export type StoredPlan = {
  /** Written by the retired planner; a plan written by `run_tasks` carries none. */
  assessment?: PlanAssessment
  /** The accepted eager-asset selection, wherever it was written from. */
  assetReceipt?: AssetReceipt
  readinessPolicyVersion?: typeof PLAN_READINESS_POLICY_VERSION
}
export type PlanAssetCatalog = {
  modelIds: readonly string[]
  sharedAssetIds: readonly string[]
  /** A fresh build with a selected starter template must record selected eager assets. */
  requiresAssetReceipt?: boolean
}

const tasksFileSchema = z.array(taskSpecSchema)
const planFileSchema = z.object({
  assessment: planAssessmentSchema.optional(),
  assetReceipt: assetReceiptSchema.optional(),
  readinessPolicyVersion: z.literal(PLAN_READINESS_POLICY_VERSION).optional(),
}).strict()

/** Parses the unchanged historical task-array artifact without runtime services. */
export function parsePlanTasksArtifact(contents: string): TaskSpec[] | undefined {
  try {
    const parsed = tasksFileSchema.safeParse(JSON.parse(contents))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** Parses additive plan metadata; undefined represents a historical plan. */
export function parseStoredPlanArtifact(contents: string): StoredPlan | undefined {
  try {
    const parsed = planFileSchema.safeParse(JSON.parse(contents))
    if (!parsed.success) return undefined

    const { assessment, readinessPolicyVersion } = parsed.data
    const assetReceipt = parsed.data.assetReceipt ?? assessment?.assetReceipt
    return {
      ...(assessment ? { assessment } : {}),
      ...(assetReceipt ? { assetReceipt } : {}),
      ...(readinessPolicyVersion ? { readinessPolicyVersion } : {}),
    }
  } catch {
    return undefined
  }
}

type PersistedToolPart = { type?: unknown; state?: unknown; output?: unknown }
const MUTATING_TOOL_PART_TYPES = new Set([
  "tool-write_file",
  "tool-replace_text",
  "tool-delete_file",
])

/** Pure persisted-history check shared by template context and focused tests. */
export function hasSuccessfulGameFileWrites(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false

  return messages.some((message) => {
    const parts = typeof message === "object" && message !== null
      ? (message as { parts?: unknown }).parts
      : undefined
    if (!Array.isArray(parts)) return false

    return parts.some((part) => {
      if (typeof part !== "object" || part === null) return false
      const record = part as PersistedToolPart
      if (record.state !== "output-available") return false
      if (MUTATING_TOOL_PART_TYPES.has(String(record.type))) {
        return typeof record.output !== "object" || record.output === null || !("error" in record.output)
      }
      if (record.type !== "tool-run_tasks" || typeof record.output !== "object" || record.output === null) {
        return false
      }
      const outcomes = (record.output as { outcomes?: unknown }).outcomes
      return Array.isArray(outcomes) && outcomes.some((outcome) => {
        if (typeof outcome !== "object" || outcome === null) return false
        const result = outcome as { wroteFiles?: unknown }
        return result.wroteFiles === true
      })
    })
  })
}

function reachesTask(tasks: readonly TaskSpec[], fromId: string, targetId: string): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const visited = new Set<string>()

  function visit(id: string): boolean {
    if (id === targetId) return true
    if (visited.has(id)) return false
    visited.add(id)
    return byId.get(id)?.dependsOn.some(visit) ?? false
  }

  return visit(fromId)
}

function findDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>()
  return values.find((value) => (seen.has(value) ? true : (seen.add(value), false)))
}

/** Validates the assessment independently from template choice or prompt wording. */
export function validatePlanAssessment(
  tasks: readonly TaskSpec[],
  assessment: PlanAssessment,
  assets: PlanAssetCatalog
): string | undefined {
  if (assessment.classification === "cohesive") {
    if (tasks.length !== 1) return "A cohesive plan must contain exactly one task."
  } else {
    if (tasks.length < 2 || tasks.length > MAX_PLAN_TASKS) {
      return "A substantial plan must contain 2–6 tasks."
    }

    const withoutAcceptance = tasks.find((task) => !task.acceptance || task.acceptance.length === 0)
    if (withoutAcceptance) {
      return `Substantial task "${withoutAcceptance.id}" needs at least one explicit acceptance criterion.`
    }

    const integrationIndex = tasks.findIndex((task) => task.id === assessment.integrationTaskId)
    if (integrationIndex === -1) {
      return `integrationTaskId "${assessment.integrationTaskId}" must name a task in this plan.`
    }
    if (integrationIndex !== tasks.length - 1) {
      return `Integration task "${assessment.integrationTaskId}" must be the final task.`
    }

    const disconnected = tasks.slice(0, integrationIndex).find(
      (task) => !reachesTask(tasks, assessment.integrationTaskId, task.id)
    )
    if (disconnected) {
      return `Integration task "${assessment.integrationTaskId}" has no dependency path to earlier task "${disconnected.id}".`
    }
  }

  const receipt = assessment.assetReceipt
  if (!receipt) {
    return assets.requiresAssetReceipt
      ? "A fresh build with a selected template requires an assetReceipt."
      : undefined
  }

  return validateAssetReceipt(receipt, assets)
}

/** The receipt's own checks: no repeats, every id in the template's catalog, no model both eager and lazy. */
export function validateAssetReceipt(
  receipt: AssetReceipt,
  assets: PlanAssetCatalog
): string | undefined {

  const eagerDuplicate = findDuplicate(receipt.eagerModelIds)
  if (eagerDuplicate) return `assetReceipt.eagerModelIds repeats "${eagerDuplicate}".`
  const lazyDuplicate = receipt.lazyModelIds && findDuplicate(receipt.lazyModelIds)
  if (lazyDuplicate) return `assetReceipt.lazyModelIds repeats "${lazyDuplicate}".`
  const sharedDuplicate = findDuplicate(receipt.eagerSharedAssetIds)
  if (sharedDuplicate) return `assetReceipt.eagerSharedAssetIds repeats "${sharedDuplicate}".`

  const knownModels = new Set(assets.modelIds)
  const unknownModel = [...receipt.eagerModelIds, ...(receipt.lazyModelIds ?? [])].find(
    (id) => !knownModels.has(id)
  )
  if (unknownModel) return `assetReceipt names unknown model id "${unknownModel}".`

  const eagerModels = new Set(receipt.eagerModelIds)
  const overlappingModel = receipt.lazyModelIds?.find((id) => eagerModels.has(id))
  if (overlappingModel) return `assetReceipt lists model "${overlappingModel}" as both eager and lazy.`

  const knownSharedAssets = new Set(assets.sharedAssetIds)
  const unknownSharedAsset = receipt.eagerSharedAssetIds.find((id) => !knownSharedAssets.has(id))
  if (unknownSharedAsset) return `assetReceipt names unknown shared asset id "${unknownSharedAsset}".`

  return undefined
}

export function validatePlanTasks(tasks: readonly TaskSpec[]): string | undefined {
  const cycle = findDependencyCycle(tasks)

  if (cycle) {
    return `dependsOn has a cycle: ${cycle.join(" -> ")}. Break the cycle before submitting — no task may wait, even transitively, on itself.`
  }

  const unknown = findUnknownDependency(tasks)

  if (unknown) {
    return `Task "${unknown.taskId}" depends on "${unknown.missing}", which is not one of this plan's own task ids. dependsOn may only reference another task in this same submission.`
  }

  for (const task of tasks) {
    for (const entry of task.owns) {
      if (isProtectedOwnership(entry)) {
        return `Task "${task.id}" declares owning "${entry}", which is inside a protected prefix (${PROTECTED_DIR_NAMES.join(", ")}) no task may ever own.`
      }
    }
  }

  const overlap = findUnresolvedOwnershipOverlap(tasks)

  if (overlap) {
    const [a, b] = overlap
    return `Tasks "${a}" and "${b}" declare overlapping ownership with no dependsOn between them. Narrow their owns so they do not overlap, or add a dependsOn between them so they never run concurrently.`
  }

  return undefined
}

/**
 * The checks a batch must pass before `run_tasks` starts any of it, now that
 * the orchestrator writes tasks itself rather than a planner submitting them:
 * the same graph and ownership rules `submit_plan` applied, with `dependsOn`
 * also allowed to name a task an earlier call finished this turn, plus the
 * template asset receipt a fresh selected-template build must declare once.
 */
export function validateDispatch(
  tasks: readonly TaskSpec[],
  {
    finishedIds,
    assets,
    receipt,
    hasStoredReceipt = false,
  }: {
    finishedIds: ReadonlySet<string>
    assets: PlanAssetCatalog
    receipt?: AssetReceipt
    /** A receipt this build already recorded (an earlier dispatch), so a later batch need not repeat it. */
    hasStoredReceipt?: boolean
  }
): string | undefined {
  const cycle = findDependencyCycle(tasks)
  if (cycle) {
    return `dependsOn has a cycle: ${cycle.join(" -> ")}. No task may wait, even transitively, on itself.`
  }

  const unknown = findUnknownDependency(tasks, finishedIds)
  if (unknown) {
    return `Task "${unknown.taskId}" depends on "${unknown.missing}", which is neither in this batch nor a task that finished earlier this turn.`
  }

  for (const task of tasks) {
    const entry = task.owns.find(isProtectedOwnership)
    if (entry) {
      return `Task "${task.id}" declares owning "${entry}", which is inside a protected prefix (${PROTECTED_DIR_NAMES.join(", ")}) no task may ever own.`
    }
  }

  const overlap = findUnresolvedOwnershipOverlap(tasks)
  if (overlap) {
    const [a, b] = overlap
    return `Tasks "${a}" and "${b}" declare overlapping ownership with no dependsOn between them. Narrow their owns, or add a dependsOn so they never run concurrently.`
  }

  if (receipt) return validateAssetReceipt(receipt, assets)

  if (assets.requiresAssetReceipt && !hasStoredReceipt) {
    return "This is a fresh build with a selected template: pass assetReceipt with the eager model ids (at most 6) the first screen loads, from the template's asset catalog."
  }

  return undefined
}

/**
 * What a dispatch does to the stored eager-asset receipt `verify` enforces.
 * A declared receipt is written. The first build's receipt is otherwise kept
 * through that build (its corrective pass included), but a later build of the
 * same game lifts it — the retired planner did the same by rewriting
 * `plan.json` without the marker — so a later turn that adds a model to the
 * first screen is not failed against the first build's selection.
 */
export function receiptAction({
  receipt,
  assets,
  hasStoredReceipt,
}: {
  receipt?: AssetReceipt
  assets: PlanAssetCatalog
  hasStoredReceipt: boolean
}): "write" | "clear" | "keep" {
  if (receipt) return "write"
  if (!assets.requiresAssetReceipt && hasStoredReceipt) return "clear"
  return "keep"
}
