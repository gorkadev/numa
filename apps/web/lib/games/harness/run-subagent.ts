import { randomUUID } from "node:crypto"

import {
  ToolLoopAgent,
  stepCountIs,
  type FinishReason,
  type ModelMessage,
  type StopCondition,
  type ToolSet,
} from "ai"

import { resolveModel, type FallbackHooks, type ServedCall } from "@/lib/ai/model-registry"
import { turnUsageTokens } from "@/lib/ai/pricing"
import { turnState } from "@/lib/games/harness/turn-state"
import { ROLE_DEFAULT_SKILLS, type SkillName } from "@/lib/games/skills/registry"

import type { EnvelopeStatus, SubagentEnvelope } from "./envelope"
import {
  MAX_EDITS_PER_RECORD,
  MAX_TOOL_CALLS_PER_RECORD,
  MAX_TOOL_CALL_ERROR_CHARS,
  type SubagentRunRecord,
  type SubagentRunTokens,
} from "./records"
import type { RoleDef } from "./roles"

/**
 * How far behind the turn's own deadline every dispatched role must stop, so
 * there is still time left for the orchestrator to read the envelope and
 * reply before the turn's own ceiling is reached (design.md's role
 * catalogue: "every timeout is min(role, deadline − now − 60 s)").
 */
const DEADLINE_BUFFER_MS = 60_000

/** How often the generator yields a fresh snapshot (decision 5: "throttled to 500 ms"). */
const PROGRESS_THROTTLE_MS = 500

export type RunSubagentInput = {
  /**
   * A stable id for this dispatched run, stamped onto every persisted
   * `SubagentRunRecord` this run yields (unit 9, task 9.2). No caller passes
   * one today — `explore.ts`, `plan.ts`, `verify.ts` and `run-tasks.ts` all
   * predate this field — so a random id is generated when omitted; a future
   * caller that wants a stable, meaningful id (`run-tasks.ts` naming a
   * worker's run after its `task.id`, for instance) can pass one.
   */
  agentId?: string
  role: RoleDef
  instructions: string
  tools: ToolSet
  prompt: string | ModelMessage[]
  abortSignal?: AbortSignal
  /**
   * The skills pushed into this run's own instructions — a role's defaults
   * plus any per-task extras (`lib/games/skills/registry.ts`'s `mergeSkills`)
   * — stamped onto every record this run yields (design.md decision 15, task
   * 9.2). Optional: no caller before unit 9 computed this to pass in, so it
   * defaults to `role.id`'s bare defaults (`ROLE_DEFAULT_SKILLS[role.id]`)
   * when omitted — accurate for `explore.ts`/`plan.ts`/`verify.ts`'s calls
   * (none of the three roles they dispatch takes a per-task skill extra), but
   * NOT the full defaults-plus-task-extras list `run-tasks.ts`'s own workers
   * actually run with, since that file is not this unit's to touch. Whoever
   * wires `run-tasks.ts` to pass its already-computed `mergeSkills(...)`
   * result through this field gets the exact list for free.
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
}

/**
 * A from-the-stream progress snapshot, replaced — not appended to — on every
 * throttled tick: the "compact preliminary record" of design.md decision 5.
 *
 * Kept as its own name — `explore.ts`, `run-tasks.ts`, `verify.ts` and
 * `plan.ts` all import it as `SubagentProgress`, and none of them are this
 * unit's files to touch — but it is now a plain alias for the client-safe
 * `SubagentRunRecord` (`./records.ts`, unit 9's task 9.1): every value this
 * generator yields is the full stamped record design.md decision 15
 * describes (agentId, role, displayName, tier, slot, modelId, modelName,
 * steps, tool calls, edits, tokens, skills, summary, status), not the bare
 * `{ activity, toolCalls }` shape unit 2a shipped.
 */
export type SubagentProgress = SubagentRunRecord

export type RunSubagentResult = {
  envelope: SubagentEnvelope
  /** Every progress snapshot taken over the run, oldest first — the last one is the run's most complete state. */
  records: SubagentProgress[]
}

/** The three write tool names whose successful call counts as an edit — duplicated from `run-tasks.ts`'s/`trigger/chat.ts`'s own copies for the same reason those two already duplicate each other's: importing across those modules is not this file's direction to take on. */
const WRITE_TOOL_NAMES = new Set(["write_file", "replace_text", "delete_file"])

/** The `path` argument of a tool call's (by then fully streamed) input, when it has one — the same duck-typed read `lib/games/tool-parts.ts`'s own `toolPath` uses. */
function toolCallPath(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined

  const path = (input as { path?: unknown }).path

  return typeof path === "string" && path.length > 0 ? path : undefined
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
 * `{ envelope, records }` once it finishes — including on failure, timeout or
 * abort, since a sub-agent failure MUST come back as a result, never a thrown
 * error that crashes the orchestrator's turn (`agent-orchestration`'s
 * Sub-Agent Failures Return as a Result and Abort Propagation requirements).
 */
export async function* runSubagent(
  input: RunSubagentInput
): AsyncGenerator<SubagentProgress, RunSubagentResult, void> {
  const { role, instructions, tools, prompt, abortSignal, stopWhen } = input
  const agentId = input.agentId ?? randomUUID()
  const skills = input.skills ?? ROLE_DEFAULT_SKILLS[role.id]

  const { hooks, takeServed } = buildRunHooks()
  const { model, primary } = resolveModel(turnState.tier, role.slot, hooks)

  const timeoutMs = Math.max(
    0,
    Math.min(role.timeoutMs, turnState.deadline - Date.now() - DEADLINE_BUFFER_MS)
  )

  const agent = new ToolLoopAgent({
    model,
    instructions,
    tools,
    stopWhen: stopWhen ?? stepCountIs(role.maxSteps),
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
  const records: SubagentProgress[] = []
  let lastEmittedAt = 0

  /**
   * Every snapshot carries the full stamped shape (design.md decision 15,
   * task 9.2) — not just the fields that change tick to tick — so a stored
   * or live-rendered record is always one complete, self-sufficient object.
   * `modelId`/`modelName` read the LATEST known server for this run
   * (`takeServed()`, never cleared by reading it — see `buildRunHooks`'s own
   * comment): the primary until the first call resolves, and whichever entry
   * actually served after that.
   */
  function snapshot(finalStatus?: EnvelopeStatus, finalSummary?: string): SubagentProgress {
    const served = takeServed()

    return {
      agentId,
      role: role.id,
      displayName: role.displayName,
      tier: turnState.tier,
      slot: role.slot,
      modelId: served?.entryId ?? primary.id,
      modelName: primary.displayName,
      status: finalStatus ?? "partial",
      activity,
      steps,
      toolCalls: [...toolCalls],
      edits: [...edits],
      tokens,
      skills,
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
          activity = `calling ${part.toolName}`
          break
        case "tool-result": {
          const path = toolCallPath(part.input)

          toolCalls = pushCapped(
            toolCalls,
            { toolName: part.toolName, toolCallId: part.toolCallId, path, ok: true },
            MAX_TOOL_CALLS_PER_RECORD
          )

          if (path && WRITE_TOOL_NAMES.has(part.toolName)) {
            edits = pushCapped(edits, path, MAX_EDITS_PER_RECORD)
          }

          activity = `finished ${part.toolName}`
          break
        }
        case "tool-error":
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
          activity = `${part.toolName} failed`
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
      const next = snapshot()
      records.push(next)
      yield next
    }

    // The throttle can drop the run's final state; flush it if so.
    if (dirty) {
      const next = snapshot()
      records.push(next)
      yield next
    }

    if (aborted || abortSignal?.aborted) {
      status = "aborted"
      // Cancelled: the caller's own signal fired. Timed out: it didn't, so the role/turn budget did.
      summary = abortSignal?.aborted ? "Cancelled." : "Timed out."
    } else {
      status = statusFromFinishReason(await result.finishReason)
      summary = await result.text
    }
  } catch (error) {
    status = isAbortLike(error) ? "aborted" : "error"
    summary = summarize(error)
  }

  /**
   * The final record, appended to `records` (not yielded — this generator's
   * own `return` value, `RunSubagentResult`, is what carries it back; see
   * `explore.ts`'s own note on why a `return` value needs no separate
   * `yield` here). Computed even when the loop above never ran at all — an
   * immediate throw before the stream started — so a run that fails or
   * aborts before its first tool call still leaves a complete,
   * correctly-stamped record behind (`subagent-view`'s "Record created for a
   * failed worker" scenario; task 9.2's "captured even on failure/abort").
   */
  const finalRecord = snapshot(status, summary)
  records.push(finalRecord)

  return { envelope: { agent: agentId, status, summary }, records }
}
