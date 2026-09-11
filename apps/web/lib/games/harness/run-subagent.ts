import { randomUUID } from "node:crypto"

import {
  ToolLoopAgent,
  stepCountIs,
  type FinishReason,
  type ModelMessage,
  type ToolSet,
} from "ai"

import { resolveModel, type FallbackHooks, type ServedCall } from "@/lib/ai/model-registry"
import { turnState } from "@/lib/games/harness/turn-state"

import type { EnvelopeStatus, SubagentEnvelope } from "./envelope"
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
   * A stable id for this dispatched run. Unit 9's `run-subagent.ts` change
   * stamps this onto a persisted `SubagentRunRecord`; no caller passes one
   * yet in 2a (nothing dispatches this runner until unit 2b), so a random id
   * is generated when omitted.
   */
  agentId?: string
  role: RoleDef
  instructions: string
  tools: ToolSet
  prompt: string | ModelMessage[]
  abortSignal?: AbortSignal
}

/**
 * A from-the-stream progress snapshot, replaced — not appended to — on every
 * throttled tick: the "compact preliminary record" of design.md decision 5.
 * Unit 9's `harness/records.ts` stamps a richer, client-safe
 * `SubagentRunRecord` on top of this shape (agentId, role, displayName, tier,
 * slot, modelId, modelName, edits, tokens, skills); nothing here duplicates
 * that work, since no dispatch tool exists yet to persist or render it.
 */
export type SubagentProgress = {
  /** One-liner for "current activity" (design.md decision 16). */
  activity: string
  toolCalls: { toolName: string; toolCallId: string; ok: boolean; error?: string }[]
}

export type RunSubagentResult = {
  envelope: SubagentEnvelope
  /** Every progress snapshot taken over the run, oldest first. */
  records: SubagentProgress[]
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
  const { role, instructions, tools, prompt, abortSignal } = input
  const agentId = input.agentId ?? randomUUID()

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
    stopWhen: stepCountIs(role.maxSteps),
    /**
     * `resolveModel`'s composite already owns retrying a candidate's own
     * retryable failures (`fallback-model.ts`); leaving `ai`'s default
     * `maxRetries` would retry the whole composite call on top of that,
     * doubling backoff. Mirrors `orchestratorModelSettings` in `lib/ai/agent.ts`.
     */
    maxRetries: 0,
  })

  const toolCalls: SubagentProgress["toolCalls"] = []
  let activity = "starting"
  const records: SubagentProgress[] = []
  let lastEmittedAt = 0

  function snapshot(): SubagentProgress {
    return { activity, toolCalls: [...toolCalls] }
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
       */
      onStepEnd: (step) => {
        const served = takeServed()

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
        case "tool-result":
          toolCalls.push({ toolName: part.toolName, toolCallId: part.toolCallId, ok: true })
          activity = `finished ${part.toolName}`
          break
        case "tool-error":
          toolCalls.push({
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            ok: false,
            error: summarize(part.error),
          })
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

  return { envelope: { agent: agentId, status, summary }, records }
}
