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
  tasks: readonly TaskSpec[]
): { taskId: string; missing: string } | undefined {
  const ids = new Set(tasks.map((task) => task.id))

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) return { taskId: task.id, missing: dep }
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
