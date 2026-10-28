import { randomUUID } from "node:crypto"

import { tool, type Tool } from "ai"
import { z } from "zod"

import {
  createScopedGameTools,
  ownershipOverlaps,
} from "@/lib/games/harness/ownership"
import { DIMENSION_PROFILES, type GameDimension } from "@/lib/games/dimension"
import { engineApiIndexFor } from "@/lib/games/instructions/engine-index"
import { runtimeInstructionsFor } from "@/lib/games/instructions/runtime"
import {
  workerInstructions,
  type WorkerFocus,
} from "@/lib/games/instructions/roles/worker"
import { readGameTemplateBuildContext } from "@/lib/games/templates/context"
import {
  mergeSkills,
  skillBodies,
  type SkillName,
} from "@/lib/games/skills/registry"

import { renderEnvelope, type SubagentEnvelope } from "../envelope"
import { clearDispatchReceipt, readPlanAssetReceipt, readPlanTasks, writeDispatchReceipt } from "../plan-store"
import { assetReceiptSchema, receiptAction, validateDispatch } from "../plan-validation"
import { ROLES } from "../roles"
import {
  runSubagent,
  type RunSubagentResult,
  type SubagentProgress,
} from "../run-subagent"
import { rejectDuplicateTaskIds, taskSpecSchemaFor, type TaskSpec } from "../task-spec"
import { turnState } from "../turn-state"
import { noWritesEnvelope, retryPromptAfterNoWrites, wroteNothing } from "../worker-outcome"
import { createLoadSkillTool } from "./load-skill"

/** At most 4 tasks in one call (design.md decision 3). */
const MAX_TASKS_PER_BATCH = 4

/**
 * At most 3 workers running at once, whatever the batch size (design.md
 * decision 3). Confirmed safe by the unit 4 gate spike
 * (`docs/research/spikes/gemini-parallel.md`): 3 concurrent Vertex calls ran
 * clean and ~3x faster than sequential; 6 still produced no errors, but one
 * run stalled 27–35 s in its second step. The spike's own conclusion is to
 * keep the cap at 3 with no serialization fallback, and to lean on each
 * worker's own per-role timeout (`run-subagent.ts`) so a stalled worker can
 * never hold the whole batch open.
 */
const POOL_CAP = 3

/**
 * `taskSpecSchema`/`TaskSpec` moved to `../task-spec.ts` in unit 8, shared
 * with `submit_plan`'s own array schema (`harness/plan-validation.ts`) — see
 * that module's own doc comment for why. `skills: SkillName[]`
 * (`lib/games/skills/registry.ts`, unit 7a) is the orchestrator's per-task
 * extra skills, pushed into the worker's instructions on top of its role's
 * defaults (`buildInstructions` below, `agent-skills`'s Orchestrator-Selected
 * Extra Skills requirement).
 *
 * Batch-level constraints on top of the shared per-task schema: at most
 * `MAX_TASKS_PER_BATCH`, and no duplicate id (`rejectDuplicateTaskIds`,
 * `../task-spec.ts` — the same check `submit_plan`'s own array schema uses,
 * since both tools key their own bookkeeping by task id). The cross-task
 * rules — cycles, unknown dependencies, protected or overlapping owns, the
 * template asset receipt — run in `execute` (`validateDispatch`).
 */
function tasksArraySchemaFor(skills: readonly SkillName[]) {
  return z
    .array(taskSpecSchemaFor(skills))
    .min(1)
    .max(MAX_TASKS_PER_BATCH)
    .superRefine(rejectDuplicateTaskIds)
}

/**
 * Rejects a batch of ids with a duplicate — the `taskIds` sibling of
 * `rejectDuplicateTaskIds` (`../task-spec.ts`), which validates full task
 * BODIES; this one validates plain id strings, so it cannot reuse that
 * function's field-shaped issue path.
 */
function rejectDuplicateTaskIdStrings(ids: string[], ctx: z.RefinementCtx): void {
  const seenAt = new Map<string, number>()

  ids.forEach((id, index) => {
    const firstIndex = seenAt.get(id)

    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [index],
        message: `Duplicate task id "${id}" (already used at index ${firstIndex}) — every id must be unique in this call.`,
      })
      return
    }

    seenAt.set(id, index)
  })
}

/**
 * `run_tasks`' own input. `tasks` — full task bodies the orchestrator writes
 * itself — is the normal way to dispatch: the separate planner that used to
 * write them cost minutes and a fifth of a build's spend, and most of its
 * plans were a single task anyway. `taskIds` stays for a game whose earlier
 * turn left an accepted plan in `.numa/tasks.json`.
 *
 * `assetReceipt` replaces the planner's own receipt for a fresh build with a
 * selected template: the eager models the first screen loads, which `verify`
 * then holds the game to.
 *
 * Built per dimension: a task's `skills` only accepts the game's profile's.
 */
const runTasksInputSchemaFor = (skills: readonly SkillName[]) => z.object({
  tasks: tasksArraySchemaFor(skills).optional().describe(
    "The tasks to dispatch, written by you: each with its own goal, the files it owns, any dependsOn, and acceptance criteria. The normal way to call this tool. Never pass this together with taskIds."
  ),
  taskIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_TASKS_PER_BATCH)
    .superRefine(rejectDuplicateTaskIdStrings)
    .optional()
    .describe(
      "Legacy: ids of tasks from a plan an earlier turn already accepted in .numa/tasks.json. Never pass this together with tasks."
    ),
  assetReceipt: assetReceiptSchema.optional().describe(
    "Required on the first dispatch of a fresh build with a selected template, and only then: the model ids (at most 6) the first screen loads eagerly, plus any lazy ones and the shared assets loaded eagerly, all from the template's asset catalog. verify checks the game loads exactly these."
  ),
})

/**
 * One task's outcome, reported back to the orchestrator's model — plus its
 * `record`, which is NOT part of what the model sees (`renderOutcomes` below
 * only ever reads `taskId`/`envelope`). `undefined` for a task that never
 * actually dispatched a worker (rejected before it started: an unmet
 * dependency, or the turn ending first).
 */
type TaskOutcome = {
  taskId: string
  envelope: SubagentEnvelope
  record?: SubagentProgress
  /** Whether this task's worker successfully wrote, edited or deleted a file — `trigger/chat.ts`'s `changedGameFiles` only needs to know whether to reload the preview. */
  wroteFiles: boolean
}

export type RunTasksResult = { outcomes: TaskOutcome[] }

/**
 * The preliminary shape: one full-batch snapshot, in dispatch order, of
 * every task that has started — its settled `record` once finished, its
 * latest live snapshot while still running. A task still waiting on
 * `dependsOn` is simply absent. Replaces a first version that yielded one
 * task's raw progress (or only the settled tasks) per event, which made a
 * concurrent batch's inline entries flicker: a still-running worker vanished
 * from the thread the moment any OTHER worker in the batch settled.
 */
type RunTasksProgress = { runs: SubagentProgress[] }

/**
 * The whole-batch rejection this tool returns when a dispatched task does
 * not match the accepted plan — never dispatched, so there is no per-task
 * `TaskOutcome` to report either. Modeled on `submit_plan`'s own `{ error }`
 * (`harness/tools/plan.ts`), the one existing batch-level rejection pattern
 * a dispatch tool in this harness already uses: run-tasks itself has no
 * prior pre-dispatch rejection of its own to match (its only other
 * pre-execute check today is the input schema's `rejectDuplicateTaskIds`,
 * which the AI SDK's own tool-input validation surfaces automatically, not
 * a hand-written result) — `submit_plan`'s convention is the closest fit,
 * and the model already knows how to react to it.
 */
type RunTasksRejection = { error: string }

/**
 * Resolves a batch of dispatched `taskIds` against the plan `submit_plan`
 * last accepted (`readPlanTasks`) — design.md's flow diagram: `run_tasks(...)
 * ─▶ check ... owns ⊆ tasks.json`, now trivially true by construction: the
 * dispatched `TaskSpec` IS the plan's own record for that id, not a
 * re-declared one that might narrow or widen it. Disjointness and
 * `dependsOn` are still enforced the way they always were: disjointness by
 * the scheduler never starting two overlapping tasks concurrently
 * (`canStart` below), `dependsOn` by `unmetDependencyOutcome`.
 */
function resolveTasksByIds(
  taskIds: readonly string[],
  plan: readonly TaskSpec[]
): { tasks: TaskSpec[] } | RunTasksRejection {
  const planById = new Map(plan.map((planTask) => [planTask.id, planTask]))
  const tasks: TaskSpec[] = []

  for (const id of taskIds) {
    const task = planById.get(id)

    if (!task) {
      return {
        error: `Task "${id}" is not one of the plan's own task ids. run_tasks dispatches the tasks submit_plan accepted by their own id — call plan again if the work has changed since it ran.`,
      }
    }

    tasks.push(task)
  }

  return { tasks }
}

/** Reported when the turn's abort signal already fired before a task got its turn to start. */
function abortedBeforeStartOutcome(task: TaskSpec): TaskOutcome {
  return {
    taskId: task.id,
    envelope: {
      agent: task.id,
      status: "aborted",
      summary: "The turn ended before this task started.",
    },
    wroteFiles: false,
  }
}

/**
 * Reported when a task's `dependsOn` can never be satisfied: an id that
 * never finished in this batch, an earlier call this turn, or at all (an
 * unknown id), a task depending on itself, or a cycle among the batch's own
 * `dependsOn` edges all look identical from the scheduler's point of view —
 * none of them ever reaches "finished this turn" (design.md decision 12) —
 * so one message covers all of them rather than diagnosing which one
 * applies.
 */
function unmetDependencyOutcome(task: TaskSpec): TaskOutcome {
  return {
    taskId: task.id,
    envelope: {
      agent: task.id,
      status: "blocked",
      summary: `dependsOn (${task.dependsOn.join(", ") || "none"}) could not be satisfied — an id that never finished this turn (in this batch or an earlier call), a self-dependency, or a dependency cycle. Fix the ids, wait for the dependency to finish first, or split the batch.`,
    },
    wroteFiles: false,
  }
}

function describeSchedulerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A worker's whole system prompt: the shared worker body plus its focus
 * section (`instructions/roles/worker.ts`), the sandbox environment
 * (`instructions/runtime.ts`), then its skills — matching design.md's role
 * catalogue Instructions column ("roles/worker + focus, runtime, defaults ∪
 * task skills, inlined design, task"). `.numa/design.md` (unit 8's
 * `submit_plan`) does not exist yet, so `task.goal` is still the worker's
 * complete brief.
 *
 * Takes the already-merged skill list rather than merging it itself:
 * `runOneTask` computes `mergeSkills(...)` once and passes the result both
 * here and to `runSubagent`'s own `skills` input, so the record it stamps
 * and the prompt it actually ran with never drift apart.
 */
function buildInstructions(
  dimension: GameDimension,
  displayName: string,
  focus: WorkerFocus,
  skills: SkillName[],
  templateContext: string
): string {
  return [
    workerInstructions(displayName, focus),
    runtimeInstructionsFor(dimension).content,
    templateContext,
    engineApiIndexFor(dimension),
    skillBodies(skills),
  ].join("\n\n")
}

function buildPrompt(task: TaskSpec): string {
  const acceptance = task.acceptance ?? []
  return `## Task: ${task.title}

${task.goal}

## Acceptance criteria
${
  acceptance.length > 0
    ? acceptance.map((criterion) => `- ${criterion}`).join("\n")
    : "- No explicit criteria were stored for this historical task. State what you could actually check."
}

Files you own for this task — write only within these:
${task.owns.map((path) => `- ${path}`).join("\n")}`
}

/**
 * Renders every task's outcome within `renderEnvelope`'s own per-envelope
 * cap (`harness/envelope.ts`), `taskId` included so the orchestrator's model
 * can map a result back to the task it dispatched.
 *
 * A task whose status is anything other than `"done"` gets an explicit,
 * imperative warning prepended, ahead of the JSON — for each one: that it
 * did NOT finish, its status, and what the worker itself reported as
 * missing (its own `summary`, the wrap-up report a worker gives when
 * `run-subagent.ts`'s own graceful-timeout mechanism cuts it short, or
 * whatever else it last said). Benchmark traces showed a worker hit its step
 * cap on an integration task ("partial") and the orchestrator still told the
 * player "¡Listo!" once a later `verify` happened to pass — a status buried
 * inside a JSON blob is too easy to skim past mid-turn, and a passing verify
 * is not evidence a task finished (`tools/verify.ts` says so too, from its
 * own end).
 */
function renderOutcomes(outcomes: TaskOutcome[]): string {
  const rendered = outcomes.map(({ taskId, envelope }) => ({
    taskId,
    ...(JSON.parse(renderEnvelope(envelope)) as SubagentEnvelope),
  }))

  const unfinished = rendered.filter((outcome) => outcome.status !== "done")

  const warning =
    unfinished.length > 0
      ? `${unfinished.length} of ${rendered.length} task(s) did NOT finish:\n${unfinished
          .map(
            (outcome) =>
              `- ${outcome.taskId} (${outcome.status}): ${outcome.summary || "no summary reported"}`
          )
          .join(
            "\n"
          )}\nA later verify passing does not change this — verify only confirms the code currently on disk runs, not that these tasks are complete. Your reply to the player MUST say plainly that this is not finished, name what is still missing from the summaries above, and offer to continue. Never describe the build or change as done while any task above is listed.\n\n`
      : ""

  return warning + JSON.stringify(rendered)
}

/**
 * Builds the `run_tasks` dispatch tool for one game.
 *
 * A batch of up to `MAX_TASKS_PER_BATCH` tasks runs through a scheduler that
 * starts up to `POOL_CAP` workers at once, only once a task's `dependsOn`
 * has finished this turn — this batch, or an earlier `run_tasks` call this
 * same turn — and no already-running task's `owns` overlaps its own
 * (`file-ownership`'s Parallel Dispatch Requires Disjoint Ownership
 * requirement; `agent-orchestration`'s concurrent half of the same rule).
 * Two tasks whose ownership overlaps never run concurrently — the scheduler
 * simply never starts the second until the first (or whichever running task
 * it conflicts with) finishes — so correctness never depends on the model
 * calling this tool once per task or emitting parallel tool calls; one call
 * with a batch is enough.
 */
export function createRunTasksTool(
  gameId: string,
  dimension: GameDimension,
  options: { onStart?: () => void } = {}
): Tool {
  const profile = DIMENSION_PROFILES[dimension]

  return tool({
    description: [
      "Dispatch the tasks you broke the build into, each against its own worker. Pass tasks: full task bodies you write yourself.",
      "Each dispatched task's worker is scoped so it can only write the files that task owns. Tasks whose owns do not overlap run concurrently, up to 3 at once; tasks that share a file, or that depend on another task via dependsOn (this batch, or an earlier run_tasks call this turn), run only after what they depend on or conflict with has finished.",
      "The batch is checked before anything starts: no dependency cycle, every dependsOn in this batch or finished earlier this turn, no owns under engine/, vendor/ or .numa/, and no overlapping owns without a dependsOn. After verify has run, one corrective call is allowed.",
    ].join(" "),
    inputSchema: runTasksInputSchemaFor(profile.skills),
    /**
     * Concurrency is built entirely inside this generator, not left to the
     * model emitting several tool calls: every task in the batch is
     * scheduled here, and the generator only finishes after every dispatched
     * worker's promise has settled (the `Promise.all` at the end of
     * `scheduleAndRun`) — a literal "Promise.all-style wait" over the whole
     * batch.
     *
     * Progress and completion from every concurrently running worker are
     * relayed through one small wake queue (`pushEvent`/`settle`); every
     * wake re-derives the full-batch `RunTasksProgress` from `outcomes` and
     * `latestByTaskId` below, so it never matters which task changed. The AI
     * SDK's own tool executor only observes the LAST value this generator
     * yields (the same guarantee `explore.ts` documents), so the final
     * `{ outcomes }` — yielded once more after the scheduler resolves — is
     * what the model actually sees; every earlier yield is a live
     * preliminary snapshot for the stored tool output and the thread's own
     * rendering.
     */
    execute: async function* (
      { taskIds, tasks: tasksInput, assetReceipt },
      { abortSignal }
    ): AsyncGenerator<RunTasksProgress | RunTasksResult | RunTasksRejection, void, void> {
      /**
       * Any number of calls before `verify`; once it has run, exactly one
       * corrective call (`turnState.tryStartPostVerifyRunTasks`).
       */
      if (taskIds && tasksInput) {
        yield {
          error:
            "Pass either tasks or taskIds, never both. tasks is the normal way to dispatch; taskIds only references a plan an earlier turn accepted.",
        }
        return
      }

      let tasks: TaskSpec[]
      let receipt: ReturnType<typeof receiptAction> = "keep"

      if (taskIds) {
        const plan = await readPlanTasks(gameId)

        if (!plan) {
          yield {
            error:
              "No plan found for this game — .numa/tasks.json does not exist yet. run_tasks dispatches a plan's own tasks by id; it does not design them. Call plan first, then dispatch its task list with run_tasks.",
          }
          return
        }

        const resolved = resolveTasksByIds(taskIds, plan)

        if ("error" in resolved) {
          yield resolved
          return
        }

        tasks = resolved.tasks
      } else if (tasksInput) {
        const { assetCatalog } = await readGameTemplateBuildContext(gameId)
        const hasStoredReceipt =
          assetCatalog.modelIds.length > 0 &&
          !assetReceipt &&
          (await readPlanAssetReceipt(gameId)) !== undefined
        const invalid = validateDispatch(tasksInput, {
          finishedIds: turnState.finishedTaskIds,
          assets: assetCatalog,
          receipt: assetReceipt,
          hasStoredReceipt,
        })

        if (invalid) {
          yield { error: invalid }
          return
        }

        receipt = receiptAction({ receipt: assetReceipt, assets: assetCatalog, hasStoredReceipt })
        tasks = tasksInput
      } else {
        yield {
          error:
            "Give tasks — the task bodies to dispatch, the normal way to call this tool — or taskIds for a plan an earlier turn accepted.",
        }
        return
      }

      /**
       * Counted only once the batch is valid: a rejected corrective batch is a
       * correctable mistake, and must not spend the turn's one corrective call.
       */
      if (!turnState.tryStartPostVerifyRunTasks()) {
        yield {
          error:
            "Verification has already started and this turn already used its one corrective run_tasks call. Run the forced second verify or report the current blocked result; no further task dispatch is allowed this turn.",
        }
        return
      }

      if (receipt === "write" && assetReceipt) await writeDispatchReceipt(gameId, assetReceipt)
      if (receipt === "clear") await clearDispatchReceipt(gameId)

      options.onStart?.()

      const indexById = new Map(tasks.map((task, index) => [task.id, index]))
      const outcomes: (TaskOutcome | undefined)[] = new Array(tasks.length)
      /** A running task's latest snapshot, kept only until it settles — `buildRunsSnapshot` below prefers the settled `record` once one exists. */
      const latestByTaskId = new Map<string, SubagentProgress>()

      const events: true[] = []
      let wake: (() => void) | undefined

      function pushEvent(): void {
        events.push(true)
        wake?.()
        wake = undefined
      }

      /**
       * Records one task's final outcome at its original batch position (so
       * the outcomes this generator reports are always in the batch's task
       * order, whatever order the tasks actually finished in — the ordering
       * this batch's own callers rely on), then wakes the consumer loop
       * below.
       *
       * Also where `turnState.unfinishedTaskIds` gets updated (harness's
       * honesty rule): every path that settles a task — a real run, a
       * dependency the scheduler could never satisfy, an abort before start,
       * or the scheduler's own defensive catch-all — reports a status here,
       * so this one spot is enough to keep that bookkeeping in sync with
       * every `TaskOutcome` this tool ever produces.
       */
      function settle(task: TaskSpec, outcome: TaskOutcome): void {
        const index = indexById.get(task.id)
        if (index !== undefined) outcomes[index] = outcome

        if (outcome.envelope.status === "done") {
          turnState.clearTaskUnfinished(task.id)
        } else {
          turnState.markTaskUnfinished(task.id)
        }

        pushEvent()
      }

      function settledOutcomes(): TaskOutcome[] {
        return outcomes.filter((outcome): outcome is TaskOutcome => outcome !== undefined)
      }

      /** One entry per dispatched task, in batch order: its settled record once finished, else its latest live snapshot. A task never dispatched (still waiting on `dependsOn`) is absent. */
      function buildRunsSnapshot(): RunTasksProgress {
        const runs: SubagentProgress[] = []

        for (const task of tasks) {
          const index = indexById.get(task.id)
          const record = (index !== undefined ? outcomes[index]?.record : undefined) ?? latestByTaskId.get(task.id)
          if (record) runs.push(record)
        }

        return { runs }
      }

      /** Drives one task's `runSubagent` run to completion — the same manual-drive pattern `explore.ts` uses (unit 2b's Deviation 1), one call per concurrently running task. */
      async function runOneTask(task: TaskSpec): Promise<void> {
        const role = ROLES[task.role]
        const skills = mergeSkills(profile.roleDefaultSkills[task.role], task.skills)
        const { templateContext } = await readGameTemplateBuildContext(gameId)

        /**
         * At most two attempts: a worker that finishes without writing any
         * file it owns gets one retry (`worker-outcome.ts`), since that is
         * how an empty provider response reads from here.
         */
        const runAttempt = (prompt: string) => runSubagent({
          role,
          /**
           * `task.id` alone is not enough: nothing stops a LATER `run_tasks`
           * call this same turn (a corrective fix pass, say) from reusing an
           * earlier task's id — `run-tasks.ts` only rejects a duplicate id
           * WITHIN one batch (`rejectDuplicateTaskIds`), not across calls,
           * and `run-subagent.ts` itself runs no retry loop of its own (each
           * task here dispatches exactly once). The random suffix makes a
           * same-turn id reuse impossible to collide on.
           */
          agentId: `${task.id}:${randomUUID().slice(0, 8)}`,
          instructions: buildInstructions(dimension, role.displayName, task.role, skills, templateContext),
          skills,
          /**
           * Scoped file tools plus `load_skill` (design.md's role catalogue:
           * "gameplay / visuals / audio ... scoped tools, load_skill") — the
           * fallback for a skill neither the role's defaults nor this task's
           * own `skills` extra covers.
           */
          tools: { ...createScopedGameTools(gameId, task.owns), load_skill: createLoadSkillTool(dimension) },
          prompt,
          abortSignal,
        })

        const drive = async (prompt: string): Promise<RunSubagentResult> => {
          const run = runAttempt(prompt)
          let next = await run.next()

          while (!next.done) {
            latestByTaskId.set(task.id, next.value)
            pushEvent()
            next = await run.next()
          }

          return next.value
        }

        const prompt = buildPrompt(task)
        let result = await drive(prompt)

        if (wroteNothing({ envelope: result.envelope, edits: result.record.edits }) && !abortSignal?.aborted) {
          result = await drive(retryPromptAfterNoWrites(prompt, task.owns))

          if (wroteNothing({ envelope: result.envelope, edits: result.record.edits })) {
            const envelope = noWritesEnvelope(result.envelope, task.owns)
            result = {
              envelope,
              record: { ...result.record, status: envelope.status, summary: envelope.summary },
            }
          }
        }

        /**
         * Recorded in `turnState`, not only in this call's own `done` set,
         * so a LATER `run_tasks` call this same turn can satisfy a
         * `dependsOn` naming this task id (the cross-call half of decision
         * 12 — see `canStart` above). Only a task that actually ran gets
         * marked: one rejected before it started (an unmet dependency, or
         * the turn ending first) never finished, so nothing later should be
         * able to depend on it either.
         */
        turnState.markTaskFinished(task.id)

        settle(task, {
          taskId: task.id,
          envelope: result.envelope,
          record: result.record,
          wroteFiles: result.record.edits.length > 0,
        })
      }

      /**
       * The pool: starts as many ready tasks as `POOL_CAP` allows, waits for
       * one to finish when the pool is full or nothing else is ready, and
       * rejects whatever is left once neither is true — every task still
       * pending at that point has a `dependsOn` this turn can never satisfy
       * (design.md decision 12).
       */
      async function scheduleAndRun(): Promise<void> {
        const ids = new Set(tasks.map((task) => task.id))
        const remaining = new Map(tasks.map((task) => [task.id, task]))
        const done = new Set<string>()
        const running = new Map<string, { task: TaskSpec; promise: Promise<void> }>()
        const allPromises: Promise<void>[] = []

        /**
         * A dependency is ready when it has finished — either earlier in
         * THIS batch (`done`), or in an earlier `run_tasks` call THIS SAME
         * TURN (`turnState.isTaskFinished`, unit 4's correction: decision
         * 12's "has not finished this turn" is turn-scoped, not
         * batch-scoped, and the tool's own description pushes the model
         * toward splitting work across several calls). An id that is part of
         * this batch is always resolved against `done`, never
         * `turnState` — it has not finished yet by definition until this
         * batch's own scheduler marks it so, however many turns' worth of
         * unrelated tasks happen to share that id in `finishedTaskIds`.
         */
        function canStart(task: TaskSpec): boolean {
          const depsReady = task.dependsOn.every((dep) =>
            ids.has(dep) ? done.has(dep) : turnState.isTaskFinished(dep)
          )
          if (!depsReady) return false
          return [...running.values()].every((r) => !ownershipOverlaps(task.owns, r.task.owns))
        }

        while (remaining.size > 0 || running.size > 0) {
          /**
           * A task that never started is reported the same way a mid-run
           * abort is (`agent-orchestration`'s Abort Propagation requirement)
           * rather than silently dropped — but a task already running is
           * left alone: `runSubagent` already forwards `abortSignal` and
           * resolves with its own `aborted` envelope, so this only stops the
           * scheduler from starting anything new.
           */
          if (abortSignal?.aborted) {
            for (const task of remaining.values()) settle(task, abortedBeforeStartOutcome(task))
            remaining.clear()
            break
          }

          let started = false

          for (const task of remaining.values()) {
            if (running.size >= POOL_CAP) break
            if (!canStart(task)) continue

            remaining.delete(task.id)
            started = true

            const promise = runOneTask(task).finally(() => {
              running.delete(task.id)
              done.add(task.id)
            })

            running.set(task.id, { task, promise })
            allPromises.push(promise)
          }

          if (started) continue

          if (running.size > 0) {
            await Promise.race([...running.values()].map((r) => r.promise))
            continue
          }

          for (const task of remaining.values()) settle(task, unmetDependencyOutcome(task))
          remaining.clear()
        }

        /**
         * The correctness guarantee this unit exists to add: wait for every
         * dispatched worker, `Promise.all`-style, before this scheduler
         * itself resolves. Without this, a worker still running when the
         * `while` loop above exits (an abort mid-batch, for instance) would
         * keep settling in the background after `execute` below had already
         * returned, and its result would never reach the model.
         */
        await Promise.all(allPromises)
      }

      const scheduling = scheduleAndRun().catch((error: unknown) => {
        /**
         * Defensive only: nothing above should actually reject —
         * `runSubagent` catches its own failures into an `error` envelope,
         * so `runOneTask` never rejects either. If the scheduler itself
         * still throws for an unforeseen reason, every task that has not
         * settled yet gets an `error` outcome rather than leaving this tool
         * call hanging with no result at all.
         */
        for (const task of tasks) {
          if (outcomes[indexById.get(task.id) ?? -1] === undefined) {
            settle(task, {
              taskId: task.id,
              envelope: { agent: task.id, status: "error", summary: describeSchedulerError(error) },
              wroteFiles: false,
            })
          }
        }
      })

      let schedulingDone = false
      void scheduling.then(() => {
        schedulingDone = true
        wake?.()
        wake = undefined
      })

      while (true) {
        const event = events.shift()

        if (event !== undefined) {
          yield buildRunsSnapshot()
          continue
        }

        if (schedulingDone) break

        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }

      yield { outcomes: settledOutcomes() }
    },
    /**
     * The orchestrator's model sees a compact per-task summary — status and
     * bounded summary text, never any worker's own step-by-step transcript
     * (`agent-orchestration`'s Compact Result Envelope requirement, the same
     * as `explore.ts`). `output` is typed as the union of everything
     * `execute` yields; only the final, non-preliminary `RunTasksResult`
     * reaches this hook in practice — see `explore.ts`'s own note on the
     * same installed-SDK guarantee.
     */
    toModelOutput: ({ output }) => ({
      type: "text",
      value:
        "outcomes" in output
          ? renderOutcomes(output.outcomes)
          : "error" in output
            ? output.error
            : "Workers are still in progress.",
    }),
  })
}
