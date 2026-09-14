import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai"

import { askPlayerQuestion, type AskQuestion } from "@/lib/games/ask-player"
import {
  collectSubagentRuns,
  type SubagentRunRecord,
} from "@/lib/games/harness/records"

/**
 * The two shapes a tool call ever arrives as. A statically declared tool
 * (everything in this app) is a `ToolUIPart`; the SDK also allows a
 * `DynamicToolUIPart` for a tool set assembled at runtime, which this
 * conversation never uses but every helper here has to type-check against
 * anyway.
 */
export type ToolPart = ToolUIPart | DynamicToolUIPart

/**
 * How each tool reads in the thread, as the three verbs a marker needs: what
 * it is doing now, what it did, and what it could not do.
 *
 * Keyed by tool name rather than derived from it, because "replace_text"
 * turned into a label mechanically reads like a function call. The user is
 * watching their game get built, not reading a log.
 *
 * The failure gets its own phrase rather than " failed" tacked onto the past
 * tense, which is how "Wrote game.js failed" ended up claiming the file was
 * written in the same breath as saying it was not.
 */
export const TOOL_LABELS: Record<
  string,
  { active: string; done: string; failed: string }
> = {
  /**
   * Only ever seen while the model is still writing the question, or when the
   * call failed — once the arguments are complete and valid the call renders
   * as the questionnaire instead.
   */
  ask_player: {
    active: "Thinking it over",
    done: "Asked you a question",
    failed: "Couldn't ask you a question",
  },
  read_file: { active: "Reading", done: "Read", failed: "Couldn't read" },
  list_files: {
    active: "Looking at the game",
    done: "Looked at the game",
    failed: "Couldn't look at the game",
  },
  write_file: { active: "Writing", done: "Wrote", failed: "Couldn't write" },
  replace_text: { active: "Editing", done: "Edited", failed: "Couldn't edit" },
  delete_file: {
    active: "Deleting",
    done: "Deleted",
    failed: "Couldn't delete",
  },
  /**
   * Behind `HARNESS_PHASES` (on by default since unit 8) — see
   * `harness/tools/explore.ts` and `trigger/chat.ts`. Declared here
   * unconditionally, like the tool itself, so a thread that ran with the
   * flag off still renders correctly for every reader, flag state included.
   */
  explore: {
    active: "Investigating",
    done: "Investigated",
    failed: "Couldn't investigate",
  },
  /**
   * Also behind `HARNESS_PHASES` (on by default since unit 8) — see
   * `harness/tools/plan.ts` and `trigger/chat.ts`. `plan` never appears in
   * `MUTATING_TOOLS` below: it only writes to `.numa/`, not the game's own
   * files, so it never triggers a preview reload.
   */
  plan: {
    active: "Planning",
    done: "Planned",
    failed: "Couldn't plan",
  },
  run_tasks: {
    active: "Building",
    done: "Built",
    failed: "Couldn't build",
  },
  /**
   * Also behind `HARNESS_PHASES` — see `harness/tools/verify.ts` and
   * `trigger/chat.ts`. `verify` never appears in `MUTATING_TOOLS` below: the
   * check reads the sandbox's console/screenshot state, it never writes to
   * the game's own files.
   */
  verify: {
    active: "Checking",
    done: "Checked",
    failed: "Couldn't check",
  },
  /** A planner's own tool — see `harness/tools/plan.ts`'s `buildSubmitPlanTool`. Never appears in the orchestrator's own thread, only in a planner run's `toolCalls` list (`subagent-run-detail.tsx`). */
  submit_plan: {
    active: "Submitting the plan",
    done: "Submitted the plan",
    failed: "Couldn't submit the plan",
  },
  /** The `load_skill` fallback tool — see `harness/tools/load-skill.ts`. Every phase role but explorer and verifier can call it. */
  load_skill: {
    active: "Loading a skill",
    done: "Loaded a skill",
    failed: "Couldn't load a skill",
  },
}

/**
 * The tools that changed the game rather than looked at it.
 *
 * Deliberately a second copy of the set in `trigger/chat.ts` rather than an
 * import: that module is the agent task, and pulling it into a client
 * component would drag the Daytona SDK into the browser bundle. The two lists
 * answer different questions — that one decides whether to reload the preview,
 * this one decides a word in a summary — and neither breaks quietly if they
 * drift.
 */
export const MUTATING_TOOLS = new Set([
  "write_file",
  "replace_text",
  "delete_file",
])

/**
 * The file a tool call is about, when it has one.
 *
 * The input is `unknown` by design: it arrives as a partial JSON object while
 * the model is still streaming its arguments, so a `path` that is not yet a
 * string is normal rather than exceptional, and the marker simply goes without
 * until it is.
 */
export function toolPath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null

  const path = (input as { path?: unknown }).path

  return typeof path === "string" && path.length > 0 ? path : null
}

/**
 * The error message on a tool result that failed without throwing, or `null`
 * for anything else — including a result that succeeded.
 */
export function outputError(output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null

  const error = (output as { error?: unknown }).error

  return typeof error === "string" ? error : null
}

/**
 * Whether a tool call has finished, however it finished.
 *
 * Collapses the SDK's seven states into the one distinction the thread draws:
 * it is still happening, or it is not. The states beyond these — approval
 * requested, responded, denied — cannot occur here because no tool is
 * configured to require approval, but they resolve rather than crash if that
 * ever changes.
 */
export function isSettled(part: ToolPart): boolean {
  return (
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"
  )
}

/**
 * Why a completed tool call did not actually succeed, if it did not.
 *
 * The subtle part of this whole component. The game tools return their
 * failures as an `{ error }` result instead of throwing, so the model can read
 * the message and correct itself without the turn dying — which means a failed
 * call arrives as `output-available`, the same state as a successful one.
 * Checking only for `output-error` would render every one of those failures as
 * a tick, and quietly tell the user a file was written when it was not.
 */
export function toolError(part: ToolPart): string | null {
  if (part.state === "output-error") return part.errorText
  if (part.state === "output-denied") return "Not allowed"
  if (part.state === "output-available") return outputError(part.output)

  return null
}

/**
 * The tools whose result is one or more sub-agent run records rather than a
 * plain file operation — these get an inline `SubagentEntry` per run instead
 * of the generic tool marker/group (design.md decision 16; `subagent-view`'s
 * Inline Entry Shimmers While Running requirement). `load_skill` is also a
 * phase tool but never dispatches a sub-agent, so it stays a plain marker.
 */
export const DISPATCH_TOOL_NAMES = new Set([
  "explore",
  "plan",
  "run_tasks",
  "verify",
])

/** A dispatch tool call's current `output`, or `undefined` for any other tool or a call still streaming its input. */
function dispatchOutput(part: ToolPart): unknown {
  if (!DISPATCH_TOOL_NAMES.has(getToolName(part))) return undefined

  return part.state === "output-available" ? part.output : undefined
}

/**
 * The sub-agent run record(s) one dispatch tool call's current output
 * carries — one for `explore`/`plan`/`verify`, up to `MAX_TASKS_PER_BATCH`
 * for a `run_tasks` batch, in dispatch order. Empty before the call's first
 * snapshot lands, in which case the caller falls back to the generic tool
 * marker until it does. Reads the exact same shape whether `output` just
 * streamed in live or was read back from a reloaded thread — `run-subagent`'s
 * own preliminary snapshot and its final persisted shape are both valid
 * input to `collectSubagentRuns` (task 10b.3).
 */
function subagentRunsForPart(part: ToolPart): SubagentRunRecord[] {
  const output = dispatchOutput(part)

  return output === undefined ? [] : collectSubagentRuns([output])
}

/**
 * Every sub-agent run recorded anywhere across a set of messages — the
 * source for `SubagentPanel`'s thread-wide list, collected in
 * `chat-thread.tsx` and reported up to `game-chat.tsx`, which renders the
 * panel. Live and reloaded runs read identically, since it is built from the
 * same current-output extraction `subagentRunsForPart` uses for one message's
 * inline entries below (`subagent-view`'s Sub-Agent Records Survive Reload
 * requirement).
 */
export function collectThreadSubagentRuns(
  messages: UIMessage[]
): SubagentRunRecord[] {
  const outputs = messages
    .flatMap((message) => message.parts)
    .filter((part): part is ToolPart => isToolUIPart(part))
    .map(dispatchOutput)
    .filter((output) => output !== undefined)

  return collectSubagentRuns(outputs)
}

/**
 * `TOOL_LABELS`'s fallback for a name that has no entry there: read as words
 * instead of a snake_case identifier ("replace_text" becomes "Replace
 * text"), rather than the raw tool name leaking into the UI unchanged. All
 * three phases share this one reading — there is no way to guess the right
 * tense for a tool this module has never seen — except `failed`, which gets
 * the same "Couldn't " prefix every entry in `TOOL_LABELS` already uses for
 * failure.
 */
function fallbackLabels(name: string): {
  active: string
  done: string
  failed: string
} {
  const readable = name
    .split("_")
    .filter(Boolean)
    .map((word, index) =>
      index === 0 ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : word
    )
    .join(" ")

  return {
    active: readable,
    done: readable,
    failed: `Couldn't ${readable.toLowerCase()}`,
  }
}

/**
 * What a tool call reads as right now: a verb for the given phase, and the
 * file it is about, if it has one. Pulled out of `toolLabel` below so a
 * caller holding a sub-agent's own tool call record — `path` and pass/fail
 * already extracted, no `ToolPart` in sight — can render the same voice
 * without reconstructing one (`subagent-run-detail.tsx`'s tool call list,
 * `run-subagent.ts`'s live `activity` string).
 */
export function describeToolCall(
  name: string,
  path: string | null | undefined,
  phase: "active" | "done" | "failed"
): string {
  const labels = TOOL_LABELS[name] ?? fallbackLabels(name)

  return `${labels[phase]}${path ? ` ${path}` : ""}`
}

/** What this call reads as right now: a verb, and the file it is about. */
export function toolLabel(part: ToolPart): string {
  const name = getToolName(part)
  const phase =
    toolError(part) !== null ? "failed" : isSettled(part) ? "done" : "active"

  return describeToolCall(name, toolPath(part.input), phase)
}

/**
 * A message's parts, folded into the blocks the thread actually renders.
 *
 * The one thing this does that a `parts.map` cannot: it coalesces a run of
 * consecutive tool calls into a single block. A turn that touches a dozen
 * files produces a dozen parts, and listing them costs the thread a screen of
 * scrolling to say "it worked on the game" — while the reply that explains
 * what changed gets pushed out of view.
 *
 * Consecutive is the whole rule. A tool call that comes after the agent has
 * said something belongs to a new group, because the sentence in between is
 * what makes it a separate stretch of work rather than more of the same one.
 *
 * `ask_player` never joins a group: it is the turn handing control back, not a
 * step to summarise. A call still streaming its arguments has no question yet
 * and stays with the tools, where it reads as "thinking it over" until the
 * question is whole.
 *
 * A dispatch tool call (`DISPATCH_TOOL_NAMES`) with at least one extracted
 * sub-agent run never joins a "tools" block either, for the same reason: it
 * gets its own `SubagentEntry` per run, not a generic marker, and consecutive
 * dispatch calls fold into one "agent" block the same way consecutive plain
 * tool calls fold into one "tools" block.
 */
export type PartBlock =
  | { kind: "text"; key: string; text: string; state?: "streaming" | "done" }
  | { kind: "tools"; key: string; parts: ToolPart[] }
  | { kind: "agent"; key: string; records: SubagentRunRecord[] }
  | {
      kind: "ask"
      key: string
      part: ToolPart
      question: AskQuestion
    }

export function groupParts(parts: UIMessage["parts"]): PartBlock[] {
  const blocks: PartBlock[] = []

  parts.forEach((part, index) => {
    if (isToolUIPart(part)) {
      const question = askPlayerQuestion(part)

      if (question) {
        blocks.push({ kind: "ask", key: part.toolCallId, part, question })
        return
      }

      const records = subagentRunsForPart(part)

      if (records.length > 0) {
        const openAgent = blocks.at(-1)

        if (openAgent?.kind === "agent") {
          openAgent.records.push(...records)
          return
        }

        blocks.push({ kind: "agent", key: part.toolCallId, records })
        return
      }

      const open = blocks.at(-1)

      if (open?.kind === "tools") {
        open.parts.push(part)
        return
      }

      blocks.push({ kind: "tools", key: part.toolCallId, parts: [part] })
      return
    }

    if (part.type !== "text") return

    blocks.push({
      kind: "text",
      key: `text-${index}`,
      text: part.text,
      state: part.state,
    })
  })

  return blocks
}
