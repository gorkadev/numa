import { randomUUID } from "node:crypto"

import { tool, type Tool } from "ai"
import { z } from "zod"

import {
  createScopedGameTools,
  ownershipOverlaps,
} from "@/lib/games/harness/ownership"
import { runtimeInstructions } from "@/lib/games/instructions/runtime"
import {
  workerInstructions,
  type WorkerFocus,
} from "@/lib/games/instructions/roles/worker"
import {
  mergeSkills,
  ROLE_DEFAULT_SKILLS,
  skillBodies,
  type SkillName,
} from "@/lib/games/skills/registry"

import { renderEnvelope, type SubagentEnvelope } from "../envelope"
import { ROLES } from "../roles"
import {
  runSubagent,
  type RunSubagentResult,
  type SubagentProgress,
} from "../run-subagent"
import { rejectDuplicateTaskIds, taskSpecSchema, type TaskSpec } from "../task-spec"
import { turnState } from "../turn-state"
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
 * since both tools key their own bookkeeping by task id).
 */
const tasksArraySchema = z
  .array(taskSpecSchema)
  .min(1)
  .max(MAX_TASKS_PER_BATCH)
  .superRefine(rejectDuplicateTaskIds)

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
function buildInstructions(displayName: string, focus: WorkerFocus, skills: SkillName[]): string {
  return [
    workerInstructions(displayName, focus),
    runtimeInstructions.content,
    skillBodies(skills),
  ].join("\n\n")
}

function buildPrompt(task: TaskSpec): string {
  return `## Task: ${task.title}

${task.goal}

Files you own for this task — write only within these:
${task.owns.map((path) => `- ${path}`).join("\n")}`
}

/**
 * Renders every task's outcome within `renderEnvelope`'s own per-envelope
 * cap (`harness/envelope.ts`), `taskId` included so the orchestrator's model
 * can map a result back to the task it dispatched.
 */
function renderOutcomes(outcomes: TaskOutcome[]): string {
  return JSON.stringify(
    outcomes.map(({ taskId, envelope }) => ({
      taskId,
      ...(JSON.parse(renderEnvelope(envelope)) as SubagentEnvelope),
    }))
  )
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
export function createRunTasksTool(gameId: string): Tool {
  return tool({
    description: [
      "Dispatch one or more workers to make changes to the game's files, each against a declared task.",
      "Each task gets its own worker, scoped so it can only write the files it declares owning — give every task everything it needs to work alone: a clear goal, the exact files it owns, and nothing that depends on another task's output arriving first, unless you list that dependency in dependsOn.",
      "Tasks whose owns do not overlap run concurrently, up to 3 at once; tasks that share a file, or that depend on another task via dependsOn (this batch, or an earlier run_tasks call this turn), run only after what they depend on or conflict with has finished. Keep a batch to tasks that genuinely belong together; a task whose files nothing else touches can go in its own call.",
    ].join(" "),
    inputSchema: z.object({ tasks: tasksArraySchema }),
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
      { tasks },
      { abortSignal }
    ): AsyncGenerator<RunTasksProgress | RunTasksResult, void, void> {
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
       */
      function settle(task: TaskSpec, outcome: TaskOutcome): void {
        const index = indexById.get(task.id)
        if (index !== undefined) outcomes[index] = outcome
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
        const skills = mergeSkills(ROLE_DEFAULT_SKILLS[task.role], task.skills)

        const run = runSubagent({
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
          instructions: buildInstructions(role.displayName, task.role, skills),
          skills,
          /**
           * Scoped file tools plus `load_skill` (design.md's role catalogue:
           * "gameplay / visuals / audio ... scoped tools, load_skill") — the
           * fallback for a skill neither the role's defaults nor this task's
           * own `skills` extra covers.
           */
          tools: { ...createScopedGameTools(gameId, task.owns), load_skill: createLoadSkillTool() },
          prompt: buildPrompt(task),
          abortSignal,
        })

        let next = await run.next()

        while (!next.done) {
          latestByTaskId.set(task.id, next.value)
          pushEvent()
          next = await run.next()
        }

        const result: RunSubagentResult = next.value

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
          : "Workers are still in progress.",
    }),
  })
}
