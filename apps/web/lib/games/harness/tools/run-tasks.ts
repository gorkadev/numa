import { tool, type Tool } from "ai"
import { z } from "zod"

import { createScopedGameTools } from "@/lib/games/harness/ownership"
import { engineInstructions } from "@/lib/games/instructions/engine"
import { runtimeInstructions } from "@/lib/games/instructions/runtime"
import {
  workerInstructions,
  type WorkerFocus,
} from "@/lib/games/instructions/roles/worker"

import { renderEnvelope, type SubagentEnvelope } from "../envelope"
import { ROLES } from "../roles"
import {
  runSubagent,
  type RunSubagentResult,
  type SubagentProgress,
} from "../run-subagent"

/**
 * At most 4 tasks in one call (design.md decision 3). Unit 3 runs them
 * strictly one at a time, in the order given: a concurrency pool (cap 3 at
 * once) and the pairwise ownership-overlap / `dependsOn` checks decision 12
 * describes are unit 4's own gated change to this same file, not this one.
 */
const MAX_TASKS_PER_BATCH = 4

/**
 * One task handed to `run_tasks`, matching design.md's Interfaces section.
 * `skills: SkillName[]` there names a type from `lib/games/skills/registry.ts`
 * (unit 7a), which does not exist yet — typed `string[]` here for now, the
 * same kind of forward-declaration gap unit 1b's `AgentUsageEntry.role` and
 * unit 2a's `SubagentProgress` documented for their own not-yet-built
 * dependencies. Nothing here reads `skills` today; unit 7b's own task list
 * already plans to widen a worker's pushed instructions with it, and nothing
 * about this field's shape needs to change for that.
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
      "Ids of other tasks in this same batch that must finish first. Not yet enforced by run_tasks — see design.md decision 12 and unit 4."
    ),
  skills: z.array(z.string()).default([]),
})

export type TaskSpec = z.infer<typeof taskSpecSchema>

/** One task's outcome, reported back to the orchestrator's model. */
type TaskOutcome = {
  taskId: string
  envelope: SubagentEnvelope
  /**
   * Whether this task's worker successfully wrote, edited or deleted a
   * file — not the file paths themselves (`SubagentEnvelope.edits`).
   * `run-subagent.ts` only captures tool NAMES today
   * (`{ toolName, toolCallId, ok, error }`), not paths; unit 9's stamped
   * `SubagentRunRecord` is what adds that. A boolean is enough for
   * `trigger/chat.ts`'s `changedGameFiles`, which only needs to know
   * whether to tell the browser to reload the preview.
   */
  wroteFiles: boolean
}

export type RunTasksResult = { outcomes: TaskOutcome[] }

/**
 * The three write tool names a task's worker may have called, duplicated
 * from `trigger/chat.ts`'s own `MUTATING_TOOLS` rather than imported: that
 * module already imports `createRunTasksTool` from this one, so importing
 * back would be circular. `tool-parts.ts` keeps its own copy of the same set
 * for an analogous reason.
 */
const WRITE_TOOL_NAMES = new Set(["write_file", "replace_text", "delete_file"])

function wroteAnyFile(records: SubagentProgress[]): boolean {
  return records.some((record) =>
    record.toolCalls.some((call) => call.ok && WRITE_TOOL_NAMES.has(call.toolName))
  )
}

/**
 * A worker's whole system prompt: the shared worker body plus its focus
 * section (`instructions/roles/worker.ts`), the sandbox environment
 * (`instructions/runtime.ts`), then the full engine instructions
 * (`instructions/engine.ts`) — matching design.md's role catalogue
 * Instructions column ("roles/worker + focus, runtime, ...").
 *
 * Design.md's own column continues "..., defaults ∪ task skills, inlined
 * design, task": the skills registry (unit 7a/7b) and `.numa/design.md`
 * (unit 8's `submit_plan`) do not exist yet, so neither is available to
 * inline here. Until then every worker gets the FULL engine instructions —
 * the same ones the orchestrator itself still gets in full pre-unit-7 — and
 * `task.goal` (`taskSpecSchema` above: "goal, procedure, constraints,
 * done-when") is the worker's complete, self-contained brief in place of a
 * separately inlined design body.
 */
function buildInstructions(displayName: string, focus: WorkerFocus): string {
  return [
    workerInstructions(displayName, focus),
    runtimeInstructions.content,
    engineInstructions.content,
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
 * Builds the `run_tasks` dispatch tool for one game — sequential only, per
 * design.md's unit 3 scope: a batch of up to `MAX_TASKS_PER_BATCH` tasks
 * runs one worker at a time, in the order given, before the next starts. A
 * concurrency pool over disjoint-ownership tasks is unit 4's own gated
 * change to this file.
 */
export function createRunTasksTool(gameId: string): Tool {
  return tool({
    description: [
      "Dispatch one or more workers to make changes to the game's files, each against a declared task.",
      "Each task gets its own worker, scoped so it can only write the files it declares owning — give every task everything it needs to work alone: a clear goal, the exact files it owns, and nothing that depends on another task's output arriving first.",
      "Tasks in one call run one after another, in the order given. Keep a batch to tasks that genuinely belong together; a task whose files nothing else touches can go in its own call.",
    ].join(" "),
    inputSchema: z.object({
      tasks: z.array(taskSpecSchema).min(1).max(MAX_TASKS_PER_BATCH),
    }),
    /**
     * Same manual-drive pattern `explore.ts` uses (unit 2b's Deviation 1),
     * extended across a batch: the AI SDK's own tool executor only observes
     * the LAST value this generator yields, so every task's own
     * `runSubagent` progress is relayed as it streams, and the running
     * `outcomes` array is yielded again after each task finishes — making
     * the final `{ outcomes }`, yielded after the last task, the one
     * non-preliminary value the SDK sees. Each yield is a copy: a streamed
     * preliminary result must not change after it was handed over.
     */
    execute: async function* (
      { tasks },
      { abortSignal }
    ): AsyncGenerator<SubagentProgress | RunTasksResult, void, void> {
      const outcomes: TaskOutcome[] = []

      for (const task of tasks) {
        /**
         * The turn's own abort signal already fired before this task's turn
         * came up — report it aborted without spending a model call on a run
         * that would abort immediately anyway. `agent-orchestration`'s Abort
         * Propagation requirement covers in-flight runs; a task that never
         * started is reported the same way rather than silently dropped.
         */
        if (abortSignal?.aborted) {
          outcomes.push({
            taskId: task.id,
            envelope: {
              agent: task.id,
              status: "aborted",
              summary: "The turn ended before this task started.",
            },
            wroteFiles: false,
          })
          yield { outcomes: [...outcomes] }
          continue
        }

        const role = ROLES[task.role]

        const run = runSubagent({
          role,
          instructions: buildInstructions(role.displayName, task.role),
          tools: createScopedGameTools(gameId, task.owns),
          prompt: buildPrompt(task),
          abortSignal,
        })

        let next = await run.next()

        while (!next.done) {
          yield next.value
          next = await run.next()
        }

        const result: RunSubagentResult = next.value

        outcomes.push({
          taskId: task.id,
          envelope: result.envelope,
          wroteFiles: wroteAnyFile(result.records),
        })

        yield { outcomes: [...outcomes] }
      }
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
