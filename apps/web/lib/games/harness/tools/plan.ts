import {
  stepCountIs,
  tool,
  type StopCondition,
  type Tool,
  type ToolSet,
} from "ai"
import { z } from "zod"

import { engineApiIndex } from "@/lib/games/instructions/engine-index"
import { plannerInstructions } from "@/lib/games/instructions/roles/planner"
import { runtimeInstructions } from "@/lib/games/instructions/runtime"
import { skillBodies, skillIndex } from "@/lib/games/skills/registry"
import { createGameTools } from "@/lib/games/tools"

import { renderEnvelope, type SubagentEnvelope } from "../envelope"
import { planTasksSchema, validatePlanTasks } from "../plan-validation"
import { writePlan } from "../plan-store"
import { ROLES } from "../roles"
import { runSubagent, type RunSubagentResult, type SubagentProgress } from "../run-subagent"
import type { TaskSpec } from "../task-spec"
import { createLoadSkillTool } from "./load-skill"

/** The only skill pushed into the planner's own instructions by default (design.md's role catalogue: "roles/planner, runtime, engine-core, skill index"). */
const PLANNER_PUSHED_SKILLS = ["engine-core"] as const

/** How many of the planner's final steps may only call `submit_plan`. */
const FORCED_SUBMIT_STEPS = 2

/** The only two tools a planner run may call directly, beyond `load_skill`/`submit_plan` — see `plannerReadTools` below. */
const PLANNER_READ_TOOL_NAMES: readonly string[] = ["read_file", "list_files"]

/**
 * The planner's read-only tools: the same subset-of-`createGameTools`
 * pattern `harness/tools/explore.ts` already established for the explorer,
 * so a path resolves and fails exactly the way it does for the
 * orchestrator's own unscoped `read_file`/`list_files` calls. No write tool:
 * a planner designs and writes `.numa/design.md`/`tasks.json` through
 * `submit_plan` (`writePlan`), never through the game's own file tools.
 */
function plannerReadTools(gameId: string): ToolSet {
  const tools = createGameTools(gameId)

  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => PLANNER_READ_TOOL_NAMES.includes(name))
  )
}

function buildPlannerInstructions(): string {
  return [
    plannerInstructions,
    runtimeInstructions.content,
    engineApiIndex,
    skillBodies(PLANNER_PUSHED_SKILLS),
    skillIndex(PLANNER_PUSHED_SKILLS),
  ]
    .filter((section) => section.length > 0)
    .join("\n\n")
}

/**
 * A submitted plan, captured from `submit_plan`'s own `execute` so the
 * outer dispatch tool (`createPlanTool` below) can report the accepted task
 * list back to the orchestrator's model — the same closure-captured pattern
 * `run-subagent.ts`'s own `buildRunHooks`/`takeServed` uses to move a value
 * from an inner callback back up to its caller.
 */
type SubmittedPlan = { design: string; tasks: TaskSpec[] }

/**
 * The plan's own task list, in the shape a browser-side reader needs to draw
 * a task strip (the task-list UI above the chat composer): just enough to
 * show a title and a status per task, never `goal`, `owns`, `dependsOn` or
 * `skills` — those stay inside `.numa/tasks.json` and the envelope's
 * JSON-encoded `summary`, not duplicated onto a field the model also has to
 * pay context for. A sibling of `envelope` on the tool's final output, not a
 * replacement for the JSON-in-`summary` shape `buildEnvelope` already
 * produces: that shape is what the orchestrator's model reads through
 * `toModelOutput`, this one is what `lib/games/plan-tasks.ts`'s pure
 * derivation reads back out of the stored tool part.
 */
export type PlanTaskSummary = { id: string; title: string; role: TaskSpec["role"] }

function planTaskSummaries(submission: SubmittedPlan | undefined): PlanTaskSummary[] | undefined {
  return submission?.tasks.map(({ id, title, role }) => ({ id, title, role }))
}

/**
 * Builds the planner's own `submit_plan` tool for one game and run. A
 * factory rather than a module-level constant: it closes over `gameId` (to
 * write the accepted plan) and its own `submission` variable (to report it
 * back), so every dispatched planner run gets an isolated tool instance —
 * two concurrent plan calls, however unlikely, could never leak one
 * another's submission.
 *
 * Validation happens in two layers (see `plan-validation.ts`'s own comment
 * on `planTasksSchema`): `inputSchema` rejects too many tasks, an unknown
 * role or skill, or a duplicate id as a correctable schema error before this
 * `execute` ever runs; `execute` then runs `validatePlanTasks` for the
 * cross-task checks a static schema cannot express (acyclic `dependsOn`, no
 * owns entry under a protected prefix, disjoint ownership outside
 * dependency chains) and returns `{ error }` for those, per design.md's own
 * wording for this tool. Only once both layers pass does anything reach the
 * sandbox.
 */
function buildSubmitPlanTool(
  gameId: string
): { tool: Tool; takeSubmission: () => SubmittedPlan | undefined } {
  let submission: SubmittedPlan | undefined

  const submitPlanTool = tool({
    description: [
      "Submit the finished plan: a short design and the list of tasks that carry it out. Call this exactly once you are confident in the plan — this is the only way your work reaches the agent that dispatched you.",
      "At most 6 tasks. Each task's role is one of gameplay, visuals or audio; its owns lists the files it may write (a directory ending in \"/\" owns everything under it), and none of them may fall under engine/, vendor/ or .numa/. dependsOn may only name another task in this same submission, and must never form a cycle.",
      "Two tasks whose owns overlap must have a dependsOn between them, or neither may declare that overlap at all.",
      "A rejected submission comes back as an error explaining exactly what to fix — correct it and call this again.",
    ].join(" "),
    inputSchema: z.object({
      design: z
        .string()
        .min(1)
        .describe(
          "The plan's design, in markdown: what you are building and why, in enough detail for a worker who has read nothing else about this turn to follow it."
        ),
      tasks: planTasksSchema,
    }),
    execute: async ({ design, tasks }) => {
      const error = validatePlanTasks(tasks)

      if (error) {
        return { error }
      }

      await writePlan(gameId, design, tasks)
      submission = { design, tasks }

      return { ok: true, taskCount: tasks.length }
    },
  })

  return { tool: submitPlanTool, takeSubmission: () => submission }
}

/**
 * Stops the planner's own loop once `submit_plan` returns a SUCCESSFUL
 * result, not merely once it is called. The SDK's own `hasToolCall` — the
 * literal function design.md's role catalogue names ("12, or
 * hasToolCall(\"submit_plan\")") — fires on any call to the named tool
 * regardless of its result, which would end the run on the planner's very
 * first rejected attempt: the model would never see its own `{ error }` to
 * react to, defeating "so the planner corrects itself in its own loop"
 * (design.md's `submit_plan` paragraph). This checks the last step's own
 * `submit_plan` tool RESULT instead, so a rejected attempt lets the loop
 * continue for the model to react to the error and try again — only a
 * successful submission actually stops the run.
 */
function planSubmitted(): StopCondition<ToolSet> {
  return ({ steps }) => {
    const lastStep = steps.at(-1)
    if (!lastStep) return false

    return lastStep.toolResults.some((result) => {
      if (result.toolName !== "submit_plan") return false

      const output = result.output
      return typeof output !== "object" || output === null || !("error" in output)
    })
  }
}

/**
 * Renders the accepted task list into the envelope the orchestrator's model
 * sees (design.md's Data Flow: "envelope{tasks:[id,role,title,owns,
 * dependsOn,skills]}"). `SubagentEnvelope` itself gains no new field for
 * this — the task list is carried in `summary`, JSON-encoded, the same way
 * `run-tasks.ts`'s own `renderOutcomes` reports a batch's outcomes back —
 * and `artifacts` names the two files a successful plan wrote.
 *
 * A run whose own envelope never saw a successful submission (partial,
 * blocked, error, aborted — the planner exhausted its step budget without
 * ever calling `submit_plan` successfully) is reported as-is: there is no
 * task list to add, and `status` already reflects what actually happened.
 */
function buildEnvelope(
  envelope: SubagentEnvelope,
  submission: SubmittedPlan | undefined
): SubagentEnvelope {
  if (!submission) return envelope

  const taskList = submission.tasks.map(({ id, role, title, owns, dependsOn, skills }) => ({
    id,
    role,
    title,
    owns,
    dependsOn,
    skills,
  }))

  return {
    ...envelope,
    status: "done",
    summary: `Plan submitted: ${submission.tasks.length} task(s). ${JSON.stringify(taskList)}`,
    artifacts: [".numa/design.md", ".numa/tasks.json"],
  }
}

/**
 * Builds the `plan` dispatch tool for one game.
 *
 * A factory, not a module-level constant, matching every other dispatch
 * tool builder (`explore.ts`, `run-tasks.ts`, `verify.ts`): it closes over a
 * `gameId` that only exists once a chat does.
 */
export function createPlanTool(gameId: string): Tool {
  return tool({
    description: [
      "Dispatch a planning sub-agent that turns a build request into a design and a task list, written to the sandbox, before any game file is touched.",
      "WHEN TO USE: a new game from scratch, or a feature substantial enough to span several files or systems — new mechanics with their own state, a visual overhaul, anything that touches gameplay, visuals and audio together.",
      "WHEN NOT TO USE: a small, localized tweak to something that already exists — adjusting a value, fixing one behavior, a change that fits in a file or two. Make that change yourself with the file tools; dispatching a planner for it wastes a whole planning pass on work you can already see how to do.",
      "Once it returns a task list, dispatch it with run_tasks — do not call plan again for tasks this call already broke down.",
    ].join(" "),
    inputSchema: z.object({
      brief: z
        .string()
        .min(1)
        .describe(
          "What to plan for, in the player's own terms — the game or feature to design and break into tasks."
        ),
    }),
    /**
     * Manually drives `runSubagent`'s generator the same way `explore.ts`,
     * `run-tasks.ts` and `verify.ts` do (their own documented Deviation
     * 1/1): its `return` value is invisible to the SDK's own
     * `for await...of` tool executor, so the final result is yielded
     * explicitly as this generator's own last value, with the envelope
     * widened to carry the accepted task list.
     */
    execute: async function* (
      { brief },
      { abortSignal }
    ): AsyncGenerator<
      SubagentProgress | (RunSubagentResult & { tasks?: PlanTaskSummary[] }),
      void,
      void
    > {
      const { tool: submitPlanTool, takeSubmission } = buildSubmitPlanTool(gameId)

      const tools: ToolSet = {
        ...plannerReadTools(gameId),
        load_skill: createLoadSkillTool(),
        submit_plan: submitPlanTool,
      }

      const run = runSubagent({
        role: ROLES.planner,
        instructions: buildPlannerInstructions(),
        tools,
        prompt: brief,
        abortSignal,
        stopWhen: [stepCountIs(ROLES.planner.maxSteps), planSubmitted()],
        /**
         * The benchmark caught planners spending all 12 steps reading engine
         * files and never submitting, which forces the orchestrator to re-plan
         * from scratch. The last steps therefore offer `submit_plan` alone and
         * require a call: two of them, so one rejected submission still gets a
         * corrected retry.
         */
        prepareStep: ({ stepNumber }) =>
          stepNumber >= ROLES.planner.maxSteps - FORCED_SUBMIT_STEPS
            ? { activeTools: ["submit_plan"], toolChoice: "required" }
            : undefined,
      })

      let next = await run.next()

      while (!next.done) {
        yield next.value
        next = await run.next()
      }

      const result: RunSubagentResult = next.value
      const submission = takeSubmission()

      yield {
        ...result,
        envelope: buildEnvelope(result.envelope, submission),
        tasks: planTaskSummaries(submission),
      }
    },
    /**
     * The orchestrator's model sees the envelope only — the accepted task
     * list JSON-encoded inside `summary`, never the planner's own
     * step-by-step transcript (`agent-orchestration`'s Compact Result
     * Envelope requirement, the same as every other dispatch tool).
     */
    toModelOutput: ({ output }) => ({
      type: "text",
      value: "envelope" in output ? renderEnvelope(output.envelope) : "The planner is still working.",
    }),
  })
}
