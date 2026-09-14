import { randomUUID } from "node:crypto"

import {
  ToolLoopAgent,
  stepCountIs,
  type FinishReason,
  type ModelMessage,
  type PrepareStepFunction,
  type StopCondition,
  type ToolSet,
} from "ai"

import {
  entryDisplayName,
  resolveModel,
  type FallbackHooks,
  type ServedCall,
} from "@/lib/ai/model-registry"
import { turnUsageTokens } from "@/lib/ai/pricing"
import { turnState } from "@/lib/games/harness/turn-state"
import { ROLE_DEFAULT_SKILLS, type SkillName } from "@/lib/games/skills/registry"
import { describeToolCall } from "@/lib/games/tool-parts"

import type { EnvelopeStatus, SubagentEnvelope } from "./envelope"
import {
  MAX_EDITS_PER_RECORD,
  MAX_PROMPT_CHARS,
  MAX_TOOL_CALLS_PER_RECORD,
  MAX_TOOL_CALL_ERROR_CHARS,
  type SubagentRunRecord,
  type SubagentRunTokens,
} from "./records"
import type { RoleDef, RoleId } from "./roles"

/**
 * How far behind the turn's own deadline every dispatched role must stop, so
 * there is still time left for the orchestrator to read the envelope and
 * reply before the turn's own ceiling is reached (design.md's role
 * catalogue: "every timeout is min(role, deadline − now − 60 s)").
 */
const DEADLINE_BUFFER_MS = 60_000

/** How often the generator yields a fresh snapshot (decision 5: "throttled to 500 ms"). */
const PROGRESS_THROTTLE_MS = 500

/**
 * A worker (`gameplay`/`visuals`/`audio`) that hits its hard timeout gets
 * killed mid-step: `run-tasks.ts` reports it `aborted`, "Timed out." — no
 * word on what, if anything, it actually finished. A benchmark run caught
 * the orchestrator relaying that as a plain success once `verify` happened
 * to pass on whatever was left on disk. Every worker role therefore gets a
 * forced wrap-up step once it is this close to running out of time: told to
 * stop editing and report honestly, so a slow run ends with a `partial`
 * summary instead of a silent kill. The hard timeout (`timeout: timeoutMs`
 * below) stays as the backstop for a run that ignores even that.
 */
const WRAP_UP_WINDOW_MS = 120_000

/** The only roles the wrap-up step applies to — the ones `run-tasks.ts` dispatches against a real file budget. `planner`'s own forced-submit `prepareStep` (`tools/plan.ts`) already handles running out of steps its own way, and `explorer`/`verifier` never write anything a wrap-up summary would need to explain. */
const WRAP_UP_ROLES: ReadonlySet<RoleId> = new Set(["gameplay", "visuals", "audio"])

/**
 * Whether this step should be forced into a text-only wrap-up: the last
 * allowed step by count, or within `WRAP_UP_WINDOW_MS` of the run's own
 * effective timeout — whichever comes first. `stepNumber` is 0-indexed (the
 * SDK passes `steps.length`, the count of steps already finished), so the
 * last step `stepCountIs(role.maxSteps)` allows is `role.maxSteps - 1`.
 */
function shouldWrapUp(
  role: RoleDef,
  timeoutMs: number,
  runStartedAt: number,
  stepNumber: number
): boolean {
  if (stepNumber >= role.maxSteps - 1) return true
  if (timeoutMs <= 0) return false

  return Date.now() - runStartedAt >= timeoutMs - WRAP_UP_WINDOW_MS
}

/**
 * The instructions a wrap-up step gets, replacing (not appending to) the
 * run's own system instructions for this one step (`instructions` overrides
 * carry forward, but nothing should run after this one: `toolChoice: "none"`
 * forecloses another tool call, and the role's own step-count `stopWhen`
 * ends the loop once this step finishes). Keeps the run's original brief
 * folded in — `${instructions}` — so the model still knows what it was
 * asked to build while it reports on it.
 */
function wrapUpInstructions(instructions: string): string {
  return `${instructions}

## You are almost out of time

Stop editing. In plain text only — no more tool calls, none will run — report exactly what you have finished so far and what is still missing or incomplete. Be honest and specific: this report is what the agent that dispatched you tells the player, so a vague "mostly done" is worse than a precise list of what still needs work.`
}

/**
 * Composes the wrap-up trigger with any caller-supplied `prepareStep` (the
 * planner passes its own forced-submit one, but the planner is never a
 * `WRAP_UP_ROLES` member — this only ever wraps a worker's own optional
 * override, which no caller passes today). Once triggered, wrap-up wins
 * outright: the caller's own step settings for that step are skipped, not
 * merged with it.
 */
function buildWrapUpPrepareStep(
  role: RoleDef,
  timeoutMs: number,
  runStartedAt: number,
  instructions: string,
  markWrappedUp: () => void,
  callerPrepareStep: PrepareStepFunction<ToolSet> | undefined
): PrepareStepFunction<ToolSet> {
  return async (options) => {
    if (shouldWrapUp(role, timeoutMs, runStartedAt, options.stepNumber)) {
      markWrappedUp()
      return { toolChoice: "none", activeTools: [], instructions: wrapUpInstructions(instructions) }
    }

    return callerPrepareStep?.(options)
  }
}

export type RunSubagentInput = {
  /**
   * A stable id for this dispatched run. `run-tasks.ts` derives one from its
   * `task.id`; every other caller (`explore.ts`, `plan.ts`, `verify.ts`)
   * relies on the default: a fresh `randomUUID()`.
   */
  agentId?: string
  role: RoleDef
  instructions: string
  tools: ToolSet
  prompt: string | ModelMessage[]
  abortSignal?: AbortSignal
  /**
   * The skills pushed into this run's own instructions, stamped onto the
   * record. `run-tasks.ts` passes its own `mergeSkills(defaults, task.skills)`
   * result; other callers rely on the default, `ROLE_DEFAULT_SKILLS[role.id]`
   * — accurate for `explore.ts`/`plan.ts`/`verify.ts`, since none of those
   * three roles ever takes a per-task skill extra.
   */
  skills?: SkillName[]
  /**
   * Overrides the role's own step-count-only stop condition
   * (`stepCountIs(role.maxSteps)`, the default below). design.md's role
   * catalogue gives the planner a second condition — "12, or
   * hasToolCall(\"submit_plan\")" — but a stop condition that fires on any
   * CALL to `submit_plan`, success or failure, would end the run on the
   * planner's very first rejected attempt: the model would never see its
   * own `{ error }` to react to, defeating "so the planner corrects itself
   * in its own loop" (design.md's `submit_plan` paragraph). Its own dispatch
   * tool (`tools/plan.ts`, unit 8) therefore passes a condition that checks
   * the last step's `submit_plan` RESULT, not merely its call, alongside the
   * same step-count ceiling every other role gets. Every other role keeps
   * the plain default.
   */
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[]
  /**
   * Per-step overrides, passed straight to the agent. The planner uses it to
   * force its last steps onto `submit_plan`, so a run that spent its budget
   * reading can never end without handing back a plan.
   */
  prepareStep?: PrepareStepFunction<ToolSet>
}

/**
 * A from-the-stream progress snapshot, replaced — not appended to — on every
 * throttled tick: the "compact preliminary record" of design.md decision 5.
 *
 * Kept under its unit-2a name — `explore.ts`, `plan.ts`, `verify.ts` and
 * `run-tasks.ts` all import it this way — but now a plain alias for the
 * client-safe `SubagentRunRecord` (`./records.ts`), the full stamped shape
 * design.md decision 15 describes.
 */
export type SubagentProgress = SubagentRunRecord

/**
 * Correction to this unit's first version: `records` no longer accumulates
 * every throttled snapshot taken over the run — an ever-growing array a long
 * run would keep in memory for nothing, since only the last one was ever
 * read. Preliminary yields still stream live snapshots for the UI; only the
 * final, returned one is kept.
 */
export type RunSubagentResult = {
  envelope: SubagentEnvelope
  record: SubagentRunRecord
}

/** The three write tool names whose successful call counts as an edit — duplicated from `run-tasks.ts`'s/`trigger/chat.ts`'s own copies for the same reason those two already duplicate each other's: importing across those modules is not this file's direction to take on. */
const WRITE_TOOL_NAMES = new Set(["write_file", "replace_text", "delete_file"])

/** The `path` argument of a tool call's (by then fully streamed) input, when it has one — the same duck-typed read `lib/games/tool-parts.ts`'s own `toolPath` uses. */
function toolCallPath(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined

  const path = (input as { path?: unknown }).path

  return typeof path === "string" && path.length > 0 ? path : undefined
}

/** One content part's text, when it has one — the duck-typed read `toolCallPath` above uses for a different field on a different shape. */
function partText(part: unknown): string {
  if (typeof part !== "object" || part === null) return ""

  const candidate = part as { type?: unknown; text?: unknown }

  return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : ""
}

/** A `ModelMessage`'s own text, joining every `{ type: "text" }` part when `content` is an array — an image or file part contributes nothing. */
function messageText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""

  return content.map(partText).filter(Boolean).join("\n\n")
}

/**
 * Reduces a run's `prompt` input to the plain text `records.ts`'s own
 * `prompt` field stores: the string as-is, or for a `ModelMessage[]` (what
 * `verify.ts` sends — a user message whose content mixes a text part with an
 * image/file part) every message's own text joined by a blank line.
 * Truncated to `MAX_PROMPT_CHARS` — the same ceiling `records.ts` documents
 * on the field itself — with a trailing "…" marking a cut.
 */
function promptToText(prompt: string | ModelMessage[]): string {
  const text =
    typeof prompt === "string"
      ? prompt
      : prompt
          .map((message) => messageText(message.content))
          .filter((part) => part.length > 0)
          .join("\n\n")

  return text.length > MAX_PROMPT_CHARS ? `${text.slice(0, MAX_PROMPT_CHARS)}…` : text
}

const ZERO_RUN_TOKENS: SubagentRunTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  reasoningTokens: 0,
}

function addRunTokens(a: SubagentRunTokens, b: SubagentRunTokens): SubagentRunTokens {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  }
}

/** Appends onto a capped array by dropping the oldest entries once it would exceed `cap` — the run-time half of `records.ts`'s own `MAX_TOOL_CALLS_PER_RECORD`/`MAX_EDITS_PER_RECORD` ceilings. */
function pushCapped<T>(list: T[], item: T, cap: number): T[] {
  const next = [...list, item]
  return next.length > cap ? next.slice(next.length - cap) : next
}

/**
 * Duck-typed the same way `fallback-model.ts`'s own abort check is: an
 * aborted `fetch`, or an agent-level timeout, can surface as either `Error`
 * or `DOMException` depending on the runtime.
 */
function isAbortLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false

  const name = (error as { name: unknown }).name

  return name === "AbortError" || name === "TimeoutError"
}

function summarize(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * `ToolLoopAgent`'s terminal `finishReason` mapped onto the envelope statuses
 * this runner can decide on its own. `blocked`, `skipped` and `unavailable`
 * are never produced here: those come from a role's own tool output or a
 * dispatch tool's own budget check (unit 2b onward), not from the shared
 * runner's generic view of a finished stream. `tool-calls` and `length`
 * read as `partial` — the step or output budget ran out before a final
 * answer, matching `agent-orchestration`'s "a worker exhausts its step
 * budget" scenario.
 */
function statusFromFinishReason(finishReason: FinishReason): EnvelopeStatus {
  switch (finishReason) {
    case "stop":
      return "done"
    case "content-filter":
    case "error":
      return "error"
    default:
      return "partial"
  }
}

/**
 * Builds one run's own `FallbackHooks`: `isUnavailable`/`markUnavailable`
 * share the turn's own skip set (an availability failure rules a candidate
 * out for every role on that slot, for the rest of the turn), but `onServed`
 * is captured locally rather than through `turnState.recordServed` — that
 * accessor keeps only the LAST server per slot, which would be wrong the
 * moment a batch of workers ever shares a slot. This runner needs the entry
 * that served each of ITS OWN steps, not the turn's last call on the slot.
 */
function buildRunHooks(): { hooks: FallbackHooks; takeServed: () => ServedCall | undefined } {
  let served: ServedCall | undefined

  const hooks: FallbackHooks = {
    isUnavailable: (id) => turnState.isUnavailable(id),
    markUnavailable: (id) => turnState.markUnavailable(id),
    onServed: (call) => {
      served = call
    },
  }

  return { hooks, takeServed: () => served }
}

/**
 * The shared runner every dispatch tool builds on (design.md's Technical
 * Approach): resolves the role's model from the turn's tier and slot,
 * forwards the caller's abort signal, clamps the role's timeout to what is
 * left of the turn, and consumes the run's stream into compact preliminary
 * records — never the sub-agent's full transcript (`agent-orchestration`'s
 * Compact Result Envelope requirement).
 *
 * A generator, not a plain async function: it yields a `SubagentProgress`
 * snapshot on a 500 ms throttle while the run is in flight, and returns
 * `{ envelope, record }` once it finishes — including on failure, timeout or
 * abort, since a sub-agent failure MUST come back as a result, never a thrown
 * error that crashes the orchestrator's turn (`agent-orchestration`'s
 * Sub-Agent Failures Return as a Result and Abort Propagation requirements).
 */
export async function* runSubagent(
  input: RunSubagentInput
): AsyncGenerator<SubagentProgress, RunSubagentResult, void> {
  const { role, instructions, tools, prompt, abortSignal, stopWhen, prepareStep } = input
  const agentId = input.agentId ?? randomUUID()
  const skills = input.skills ?? ROLE_DEFAULT_SKILLS[role.id]
  const promptText = promptToText(prompt)

  const { hooks, takeServed } = buildRunHooks()
  const { model, primary } = resolveModel(turnState.tier, role.slot, hooks)

  const timeoutMs = Math.max(
    0,
    Math.min(role.timeoutMs, turnState.deadline - Date.now() - DEADLINE_BUFFER_MS)
  )

  const runStartedAt = Date.now()
  /** Set once `buildWrapUpPrepareStep` actually forces a wrap-up step — read after the run ends to turn a natural `"done"` finish into the honest `"partial"` it actually is (see the `status` override below). */
  let wrappedUp = false

  const effectivePrepareStep = WRAP_UP_ROLES.has(role.id)
    ? buildWrapUpPrepareStep(
        role,
        timeoutMs,
        runStartedAt,
        instructions,
        () => {
          wrappedUp = true
        },
        prepareStep
      )
    : prepareStep

  const agent = new ToolLoopAgent({
    model,
    instructions,
    tools,
    stopWhen: stopWhen ?? stepCountIs(role.maxSteps),
    prepareStep: effectivePrepareStep,
    /**
     * `resolveModel`'s composite already owns retrying a candidate's own
     * retryable failures (`fallback-model.ts`); leaving `ai`'s default
     * `maxRetries` would retry the whole composite call on top of that,
     * doubling backoff. Mirrors `orchestratorModelSettings` in `lib/ai/agent.ts`.
     */
    maxRetries: 0,
  })

  let toolCalls: SubagentProgress["toolCalls"] = []
  let edits: string[] = []
  let steps = 0
  let tokens: SubagentRunTokens = ZERO_RUN_TOKENS
  let activity = "starting"
  let lastEmittedAt = 0

  /**
   * Every snapshot carries the full stamped shape, not just the fields that
   * change tick to tick, so a live or persisted record is always complete on
   * its own. `modelId`/`modelName` read the latest known server for this run
   * (`takeServed()`, never cleared by reading it). No `finalStatus`/
   * `finalSummary` means the run has not ended yet: `"running"`, a value no
   * genuine `EnvelopeStatus` can produce, so it can never be mistaken for one.
   */
  function snapshot(finalStatus?: EnvelopeStatus, finalSummary?: string): SubagentProgress {
    const served = takeServed()
    const servedId = served?.entryId ?? primary.id

    return {
      agentId,
      role: role.id,
      displayName: role.displayName,
      tier: turnState.tier,
      slot: role.slot,
      modelId: servedId,
      modelName: entryDisplayName(servedId),
      status: finalStatus ?? "running",
      activity,
      steps,
      toolCalls: [...toolCalls],
      edits: [...edits],
      tokens,
      skills,
      prompt: promptText,
      summary: finalSummary ?? "",
    }
  }

  let status: EnvelopeStatus
  let summary: string

  try {
    const result = await agent.stream({
      prompt,
      abortSignal,
      timeout: timeoutMs,
      /**
       * One ledger entry per finished step, against whichever entry actually
       * served THAT step's call — not the slot's primary — so a fallback
       * mid-run is billed correctly (`turn-usage-accounting`'s Per-Sub-Agent
       * Breakdown Retained requirement). Recorded here, before the run's
       * overall outcome is known, so a step that finished before a later
       * failure or abort still counts (Failed/Aborted Usage Still Counts).
       *
       * Also where this run's own `steps` count and `tokens` total advance
       * (task 9.2): both are per-step facts the ledger entry already reads
       * off `step.usage`, so they are folded in here rather than re-derived
       * from a second pass over `finish-step` stream parts.
       */
      onStepEnd: (step) => {
        const served = takeServed()

        steps += 1
        tokens = addRunTokens(tokens, turnUsageTokens(step.usage))

        turnState.addUsage({
          agentId,
          role: role.id,
          slot: role.slot,
          modelId: served?.entryId ?? primary.id,
          fallbackFrom: served?.fallbackFrom,
          usage: step.usage,
          status: "done",
        })
      },
    })

    /**
     * `fullStream` is `@deprecated` in the installed `ai@7.0.93`, in favor of
     * the identically-shaped `stream` property — used here under the current
     * name; design.md decision 5 and the tasks artifact both name it
     * "fullStream", the concept the SDK now exposes as `stream`. Only
     * tool-call, tool-result, tool-error, finish-step and abort parts feed a
     * snapshot; every other part (text/reasoning deltas, sources, files) is
     * skipped — the envelope's `summary` comes from `result.text` once the
     * stream ends, not from accumulating text deltas here.
     *
     * `streamText` does NOT throw on abort: the merged signal (the caller's
     * `abortSignal`, or the `timeout` firing) closes the stream with an
     * `abort` part instead of rejecting it, so it must be handled as a part
     * type here, not caught below.
     */
    let aborted = false
    let dirty = false

    for await (const part of result.stream) {
      switch (part.type) {
        case "tool-call":
          activity = describeToolCall(
            part.toolName,
            toolCallPath(part.input),
            "active"
          )
          break
        case "tool-result": {
          const path = toolCallPath(part.input)

          toolCalls = pushCapped(
            toolCalls,
            { toolName: part.toolName, toolCallId: part.toolCallId, path, ok: true },
            MAX_TOOL_CALLS_PER_RECORD
          )

          // First-seen order: a repeat write to an already-recorded path does not re-add or reorder it.
          if (path && WRITE_TOOL_NAMES.has(part.toolName) && !edits.includes(path)) {
            edits = pushCapped(edits, path, MAX_EDITS_PER_RECORD)
          }

          activity = describeToolCall(part.toolName, path, "done")
          break
        }
        case "tool-error":
          activity = describeToolCall(
            part.toolName,
            toolCallPath(part.input),
            "failed"
          )
          toolCalls = pushCapped(
            toolCalls,
            {
              toolName: part.toolName,
              toolCallId: part.toolCallId,
              path: toolCallPath(part.input),
              ok: false,
              error: summarize(part.error).slice(0, MAX_TOOL_CALL_ERROR_CHARS),
            },
            MAX_TOOL_CALLS_PER_RECORD
          )
          break
        case "finish-step":
          activity = "thinking"
          break
        case "abort":
          aborted = true
          activity = "stopping"
          break
        default:
          continue
      }

      dirty = true
      const now = Date.now()
      if (now - lastEmittedAt < PROGRESS_THROTTLE_MS) continue
      lastEmittedAt = now
      dirty = false
      yield snapshot()
    }

    // The throttle can drop the run's last in-progress state; flush it if so.
    if (dirty) yield snapshot()

    if (aborted || abortSignal?.aborted) {
      status = "aborted"
      // Cancelled: the caller's own signal fired. Timed out: it didn't, so the role/turn budget did.
      summary = abortSignal?.aborted ? "Cancelled." : "Timed out."
    } else {
      status = statusFromFinishReason(await result.finishReason)
      summary = await result.text

      /**
       * A wrap-up step ends the loop the same way a genuinely finished run
       * does — the model stops calling tools, `finishReason` reads `"stop"`,
       * `statusFromFinishReason` says `"done"` — but the run was cut short,
       * not completed: `"done"` here would be exactly the dishonest
       * completion this whole mechanism exists to prevent. Only downgrades
       * an otherwise-`"done"` result; a wrap-up that still ended in
       * `"partial"`/`"error"` (the model tried something else anyway) keeps
       * whatever `statusFromFinishReason` already decided.
       */
      if (wrappedUp && status === "done") {
        status = "partial"
      }
    }
  } catch (error) {
    status = isAbortLike(error) ? "aborted" : "error"
    summary = summarize(error)
  }

  /**
   * Computed even when the loop above never ran at all — an immediate throw
   * before the stream started — so a run that fails or aborts before its
   * first tool call still returns a complete, correctly-stamped record
   * (`subagent-view`'s "Record created for a failed worker" scenario).
   */
  return { envelope: { agent: agentId, status, summary }, record: snapshot(status, summary) }
}
