import { getToolName, isToolUIPart, type UIMessage } from "ai"

/**
 * A plan task's role, duplicated from `harness/task-spec.ts`'s own
 * `taskSpecSchema` rather than imported — this module reads a thread's
 * already-serialized tool parts, the same client-safe boundary
 * `harness/records.ts` documents on its own duplicated enums, so it stays
 * free of the Daytona/database import chain a server-only harness module
 * would drag in.
 */
export type PlanTaskRole = "gameplay" | "visuals" | "audio"

/**
 * The task strip's own status vocabulary — coarser than
 * `harness/records.ts`'s `SubagentRunStatus`/`EnvelopeStatus` on purpose
 * (design's task-list UI only ever draws four rows: hollow circle, spinner,
 * check, alert). `"failed"` folds every terminal-but-not-`"done"` envelope
 * status a `run_tasks` outcome can carry — `error`, `blocked`, `aborted`,
 * and `partial` (a worker that exhausted its step budget without finishing)
 * — into the one "this needs attention" bucket the strip's alert icon
 * covers; nothing in `run_tasks`' own outcomes ever produces `skipped` or
 * `unavailable` (those are `verify`-only), so this union does not carry them.
 */
export type TaskStripStatus = "pending" | "running" | "done" | "failed"

export type TaskStripTask = {
  id: string
  title: string
  role: PlanTaskRole
  status: TaskStripStatus
  /** The running record's own one-liner ("calling write_file"), shown instead of a status word while `status` is `"running"`. */
  activity?: string
}

type PlanTaskSummary = { id: string; title: string; role: PlanTaskRole }

function isPlanTaskRole(value: unknown): value is PlanTaskRole {
  return value === "gameplay" || value === "visuals" || value === "audio"
}

/**
 * Reads a `plan` tool call's final output for its structured `tasks` field
 * (`harness/tools/plan.ts`'s `PlanTaskSummary[]`) — never the JSON-encoded
 * task list inside `envelope.summary`, which exists for the orchestrator's
 * model to read, not for this thread-side derivation to re-parse. `output`
 * is duck-typed the same way every other reader in `tool-parts.ts` treats a
 * tool's `unknown` output: a thread persisted before this field existed
 * simply has no `tasks` array to find, and reads as `undefined` rather than
 * throwing (the "old persisted messages yield no task list" rule).
 */
function planTasksFromOutput(output: unknown): PlanTaskSummary[] | undefined {
  if (typeof output !== "object" || output === null) return undefined

  const tasks = (output as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) return undefined

  const summaries: PlanTaskSummary[] = []

  for (const raw of tasks) {
    if (typeof raw !== "object" || raw === null) continue

    const { id, title, role } = raw as Record<string, unknown>
    if (typeof id !== "string" || typeof title !== "string") continue
    if (!isPlanTaskRole(role)) continue

    summaries.push({ id, title, role })
  }

  return summaries.length > 0 ? summaries : undefined
}

/** A `run_tasks` call's own declared batch — its `input.tasks`, read for their ids only, duck-typed the same way `tool-parts.ts`'s own `toolPath` reads a tool call's input. */
function runTasksDeclaredIds(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return []

  const tasks = (input as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) return []

  return tasks
    .map((task) =>
      typeof task === "object" && task !== null
        ? (task as { id?: unknown }).id
        : undefined
    )
    .filter((id): id is string => typeof id === "string")
}

/** `run_tasks`' own `EnvelopeStatus` vocabulary (`harness/envelope.ts`), folded into the strip's coarser status — see `TaskStripStatus`'s own comment. */
function envelopeStatusToStripStatus(status: string): TaskStripStatus {
  return status === "done" ? "done" : "failed"
}

/**
 * Applies one `run_tasks` call's current output onto the running
 * `id -> status` map, for the ids that call actually declared
 * (`declaredIds`). Handles both shapes a `run_tasks` tool-output value can
 * be, live or persisted (`harness/tools/run-tasks.ts`'s `RunTasksProgress`/
 * `RunTasksResult`):
 *
 * - The final `{ outcomes }`: one `TaskOutcome` per dispatched id, keyed by
 *   its own `taskId` field directly.
 * - The preliminary `{ runs }`: bare `SubagentRunRecord`s with no `taskId`
 *   field at all. `run-tasks.ts`'s own `runOneTask` stamps each one's
 *   `agentId` as `` `${task.id}:${randomSuffix}` `` (documented there so a
 *   same-turn id reuse across calls can never collide) — matched back to a
 *   declared id by that exact prefix, the one stable fact about the shape
 *   this module is allowed to lean on without importing `run-tasks.ts`
 *   itself.
 *
 * A declared id this call's current output has nothing for yet (still
 * waiting on an unmet `dependsOn`) is left untouched, not downgraded —
 * whatever an earlier call already resolved for it stands until a later one
 * overwrites it.
 */
function applyRunTasksOutput(
  statusById: Map<string, { status: TaskStripStatus; activity?: string }>,
  declaredIds: readonly string[],
  output: unknown
): void {
  if (typeof output !== "object" || output === null) return

  const outcomes = (output as { outcomes?: unknown }).outcomes

  if (Array.isArray(outcomes)) {
    for (const outcome of outcomes) {
      if (typeof outcome !== "object" || outcome === null) continue

      const { taskId, envelope } = outcome as { taskId?: unknown; envelope?: unknown }
      if (typeof taskId !== "string") continue
      if (typeof envelope !== "object" || envelope === null) continue

      const status = (envelope as { status?: unknown }).status
      if (typeof status !== "string") continue

      statusById.set(taskId, { status: envelopeStatusToStripStatus(status) })
    }

    return
  }

  const runs = (output as { runs?: unknown }).runs
  if (!Array.isArray(runs)) return

  for (const id of declaredIds) {
    const record = runs.find(
      (candidate): candidate is Record<string, unknown> =>
        typeof candidate === "object" &&
        candidate !== null &&
        typeof (candidate as { agentId?: unknown }).agentId === "string" &&
        (candidate as { agentId: string }).agentId.startsWith(`${id}:`)
    )
    if (!record) continue

    const status = record.status
    if (typeof status !== "string") continue

    statusById.set(id, {
      status: status === "running" ? "running" : envelopeStatusToStripStatus(status),
      activity:
        status === "running" && typeof record.activity === "string"
          ? record.activity
          : undefined,
    })
  }
}

/**
 * The task strip's whole derivation, from a thread's raw messages (the task
 * list attached above the chat composer, Cursor's "pending tasks" strip —
 * `task-strip.tsx` renders whatever this returns).
 *
 * Takes the LATEST `plan` tool part with an accepted task list — an earlier
 * plan a later one superseded contributes nothing, "a new plan replaces the
 * list automatically" — then folds every `run_tasks` part AFTER it, in
 * message and part order, onto that task list's own ids. A task id the plan
 * declared but no `run_tasks` call has touched yet reads as `"pending"`.
 *
 * `undefined` when no message carries a plan with a task list at all —
 * `task-strip.tsx`'s caller treats that the same as "nothing to show", not
 * as an empty list to render a header for.
 */
export function deriveTaskStrip(messages: UIMessage[]): TaskStripTask[] | undefined {
  const parts = messages.flatMap((message) => message.parts)

  let planTasks: PlanTaskSummary[] | undefined
  let planIndex = -1

  parts.forEach((part, index) => {
    if (!isToolUIPart(part)) return
    if (getToolName(part) !== "plan") return
    if (part.state !== "output-available") return

    const tasks = planTasksFromOutput(part.output)
    if (!tasks) return

    planTasks = tasks
    planIndex = index
  })

  if (!planTasks) return undefined

  const statusById = new Map<string, { status: TaskStripStatus; activity?: string }>()

  parts.forEach((part, index) => {
    if (index <= planIndex) return
    if (!isToolUIPart(part)) return
    if (getToolName(part) !== "run_tasks") return
    if (part.state !== "output-available") return

    applyRunTasksOutput(statusById, runTasksDeclaredIds(part.input), part.output)
  })

  return planTasks.map((task) => {
    const found = statusById.get(task.id)

    return {
      id: task.id,
      title: task.title,
      role: task.role,
      status: found?.status ?? "pending",
      activity: found?.activity,
    }
  })
}

/**
 * The task strip's visibility rule: shown while the turn is streaming (even
 * once every task is already done, so it does not vanish out from under a
 * still-running turn), or while the latest plan has any task that is not
 * `"done"`. Hidden once the turn has finished and every task is done. A task
 * that ended `"failed"` keeps the strip visible after the turn finishes too
 * — there is no "clear all"; only a newer plan (`deriveTaskStrip` picking up
 * a later `plan` call) replaces the list.
 */
export function shouldShowTaskStrip(
  tasks: TaskStripTask[] | undefined,
  streaming: boolean
): boolean {
  if (!tasks || tasks.length === 0) return false

  return streaming || tasks.some((task) => task.status !== "done")
}
