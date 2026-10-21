import { z } from "zod"

import { tierIdSchema } from "@/lib/ai/model-catalog"

/**
 * The client-safe half of a sub-agent run's record (unit 9, task 9.1;
 * `subagent-view`'s Sub-Agent Run Record Fields requirement). Every field
 * here is either a plain string/number/boolean or a small closed enum this
 * file declares on its own — nothing is imported from `run-subagent.ts`,
 * `harness/roles.ts`, `lib/ai/model-registry.ts` or `lib/ai/pricing.ts`, so a
 * 10a/10b client component can import this module without pulling in
 * Daytona, Trigger, a Node API or a model provider. `lib/ai/model-catalog.ts`
 * is the one exception: it is already the client-safe half of the tier
 * story (`model-picker.tsx` imports it today), so reusing its `tierIdSchema`
 * here is the same trust boundary this file itself sits on, not a new one.
 *
 * `run-subagent.ts` is the only producer of a value this schema validates —
 * see that file's own `SubagentProgress` alias, which stamps one of these on
 * every throttled snapshot it yields (design.md decision 5).
 */

/**
 * Duplicated from `harness/roles.ts`'s `RoleId` rather than imported, for the
 * same client-safety reason `lib/ai/model-catalog.ts`'s own
 * `legacyModelIdSchema` duplicates `model-registry.ts`'s `ModelEntryId`
 * instead of importing it: a role added to `ROLES` needs a matching entry
 * added here by hand.
 */
export const subagentRoleIdSchema = z.enum([
  "explorer",
  "planner",
  "gameplay",
  "visuals",
  "audio",
  "verifier",
])

export type SubagentRoleId = z.infer<typeof subagentRoleIdSchema>

/** Duplicated from `lib/ai/model-registry.ts`'s `Slot`, for the same reason as `subagentRoleIdSchema` above. */
export const subagentSlotSchema = z.enum(["strong", "mid", "light"])

export type SubagentSlot = z.infer<typeof subagentSlotSchema>

/**
 * `lib/ai/pricing.ts`'s `EnvelopeStatus` values (re-exported by
 * `harness/envelope.ts`), duplicated for the same reason as the two enums
 * above, plus one value `EnvelopeStatus` does not have: `"running"`, stamped
 * on a record that has not finished yet. A correction to this unit's first
 * version, which reused `"partial"` as that placeholder — ambiguous with the
 * genuine terminal `"partial"` a role gets from actually exhausting its step
 * budget. `"running"` cannot collide with any real `EnvelopeStatus`, so a
 * live snapshot is never confused with a finished one. The running/finished
 * distinction the UI itself draws (design.md decision 16: shimmer vs. plain
 * status text) is still expected to come from the surrounding tool call's
 * own streaming state, not from this field; unit 10b owns wiring that up.
 */
export const subagentRunStatusSchema = z.enum([
  "done",
  "partial",
  "blocked",
  "error",
  "aborted",
  "skipped",
  "unavailable",
  "running",
])

export type SubagentRunStatus = z.infer<typeof subagentRunStatusSchema>

/** How long a tool call's own error text may be, capped by `run-subagent.ts` at the same value (task 9.2: "≤200-char error"). */
export const MAX_TOOL_CALL_ERROR_CHARS = 200

/**
 * A defensive ceiling on how many tool calls (or edited paths) one record
 * carries — not a limit any role's own step budget approaches today
 * (`harness/roles.ts`'s highest `maxSteps` is 20), but a bound that keeps a
 * malformed or maliciously oversized persisted record unparseable rather
 * than accepted, and keeps a single `games.messages` row bounded regardless
 * of what a future role's step budget turns out to be.
 */
export const MAX_TOOL_CALLS_PER_RECORD = 100
export const MAX_EDITS_PER_RECORD = 100

/**
 * A defensive ceiling on how long the recorded `prompt` stays — the same
 * reasoning as `MAX_TOOL_CALL_ERROR_CHARS` above, sized for a whole prompt
 * rather than a one-line tool error: long enough to keep real context, short
 * enough that a single `games.messages` row stays bounded no matter how
 * large a caller's own prompt gets.
 */
export const MAX_PROMPT_CHARS = 8_000

/**
 * How long ONE narration entry's text may get. Narration is trimmed by TAIL:
 * the NEWEST characters survive, because the tail is the part that is still
 * interesting when a model reasons for a thousand tokens, and the surviving
 * text is prefixed with a single "…" marking the cut. The cap bounds the
 * whole stored string, marker included — `subagentTimelineEntrySchema`
 * accepts 4,000 characters, never 4,001.
 *
 * Applied by `narration.ts` (neither a delta nor a coalesced run of deltas
 * is allowed to grow past it) and enforced again here, so a malformed or
 * maliciously oversized persisted record stays unparseable rather than
 * accepted.
 */
export const MAX_NARRATION_CHARS_PER_ENTRY = 4_000

/**
 * How much narration one whole record may carry, summed over its `reasoning`
 * and `text` entries. A sub-agent's record is re-sent in every progress
 * snapshot (`run-subagent.ts`'s 500 ms throttle), so this is what keeps a
 * long, chatty run from making each of those snapshots unbounded.
 *
 * `narration.ts` applies it by dropping the OLDEST narration entries whole —
 * never a `tool` entry, which is the part that cannot be re-derived from
 * anything else — until the rest fits; a single entry that on its own still
 * exceeds the budget is tail-trimmed instead of dropped.
 */
export const MAX_NARRATION_CHARS_PER_RECORD = 16_000

/**
 * How many entries one `timeline` may carry. Over the ceiling, the OLDEST
 * narration entries are dropped first, and only if that is not enough are the
 * oldest `tool` entries dropped as well — a `tool` entry is the last thing
 * this cap gives up, never the first.
 *
 * That last-resort tool eviction is not optional bookkeeping. A long builder
 * run settles far more calls than entries: `roles.ts`'s highest `maxSteps` is
 * 30 and a builder reads three or four files per step, so a single ordinary
 * run can settle 120+ calls. `MAX_TOOL_CALLS_PER_RECORD` does NOT help here —
 * it caps the flat `toolCalls` list, while every settled call still appends a
 * `tool` entry. An over-cap timeline fails `subagentRunRecordSchema`, and
 * `collectSubagentRuns`/`subagentRunsForPart` DROP a record that fails to
 * parse, so the failure mode is a card that collapses to a generic chip
 * mid-run. Hence the hard invariant: `narration.ts` never returns a timeline
 * longer than this, whatever the mix of entries.
 *
 * Losing an old tool entry costs nothing a reader needs: the flat `toolCalls`
 * list keeps the newest `MAX_TOOL_CALLS_PER_RECORD` for `wroteAnyFile` and
 * every other consumer.
 */
export const MAX_TIMELINE_ENTRIES = 120

/**
 * One entry in a run's ordered `timeline` — the raw material ST-4 renders as
 * a chat-style block: what the sub-agent reasoned, what it said, and what it
 * did, in ARRIVAL order.
 *
 * Narration entries (`reasoning`, `text`) are coalesced by `narration.ts`:
 * consecutive deltas of the same kind append to the last entry of that kind
 * rather than opening one entry per chunk. A `tool` entry is appended where
 * its call SETTLED (a `tool-result` or `tool-error` part), carrying the same
 * `toolName`/`path`/`ok`/`error` data its matching `toolCalls` entry carries
 * — the flat list stays for `run-tasks.ts`'s own reads, the timeline for the
 * render, and both are derived from the same stream part.
 *
 * An `edit` kind, with a bounded diff, is designed but deferred with the
 * code-visibility work (`odd/tasks/subagent-trace.md`'s pending list), which
 * is why this is a discriminated union rather than a shape that has to be
 * widened everywhere later.
 */
export const subagentTimelineEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reasoning"),
    text: z.string().max(MAX_NARRATION_CHARS_PER_ENTRY),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string().max(MAX_NARRATION_CHARS_PER_ENTRY),
  }),
  z.object({
    kind: z.literal("tool"),
    toolName: z.string(),
    /** Present only for a call whose input had already streamed a `path` argument by the time it settled. */
    path: z.string().optional(),
    /**
     * The settled call's id — the join key back to its `toolCalls` entry and,
     * later, to its own input for the deferred "show the code being modified"
     * work. Optional like `path`: a defensive reader must not depend on it.
     * Index alignment is not enough on its own — this timeline evicts its
     * oldest entries, and `toolCalls` evicts independently.
     */
    toolCallId: z.string().optional(),
    ok: z.boolean(),
    error: z.string().max(MAX_TOOL_CALL_ERROR_CHARS).optional(),
  }),
])

export type SubagentTimelineEntry = z.infer<typeof subagentTimelineEntrySchema>

/**
 * One tool call a sub-agent made, as far as the run record needs to know
 * about it (design.md decision 15 / task 9.2: "name, path, ok, ≤200-char
 * error"). Named `toolName`, not `name`: unit 2a's `SubagentProgress` shape
 * already used `toolName`, and `harness/tools/run-tasks.ts`'s own
 * `wroteAnyFile` reads `call.toolName` today — that file is not part of this
 * unit's task list, so the field keeps its existing name rather than forcing
 * an unrelated file to change to stay compiling.
 */
export const subagentToolCallSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  /** Present only for a call whose input had already streamed a `path` argument by the time it settled. */
  path: z.string().optional(),
  ok: z.boolean(),
  error: z.string().max(MAX_TOOL_CALL_ERROR_CHARS).optional(),
})

export type SubagentToolCall = z.infer<typeof subagentToolCallSchema>

/**
 * The four token counts a run consumed, summed across every step it
 * completed. Structurally identical to `lib/ai/pricing.ts`'s own `Tokens` —
 * `turnUsageTokens`'s return value satisfies this shape directly — but
 * declared again here rather than imported, for the same rate-card-isolation
 * reason as `subagentRunStatusSchema` above.
 */
export const subagentRunTokensSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedInputTokens: z.number(),
  reasoningTokens: z.number(),
})

export type SubagentRunTokens = z.infer<typeof subagentRunTokensSchema>

/**
 * The full record kept for one sub-agent run (`subagent-view`'s Sub-Agent Run
 * Record Fields requirement; design.md decision 15). `modelId` and
 * `modelName` are plain strings, not `lib/ai/model-registry.ts`'s
 * `ModelEntryId`/`ModelEntry`, on purpose: they are stamped at run time from
 * whichever concrete entry served the call, so a record still renders its
 * model's display name after that entry is later removed from the registry
 * (`subagent-view`'s "Record outlives a registry change" scenario) — the
 * same reasoning applies to `skills`, which stays `string[]` rather than
 * `lib/games/skills/registry.ts`'s closed `SkillName`, so a record survives a
 * later rename or removal of a skill it used.
 */
export const subagentRunRecordSchema = z.object({
  /** Stable per dispatched run; `run-subagent.ts` defaults it to a fresh `randomUUID()` when a caller does not supply one. */
  agentId: z.string().min(1),
  role: subagentRoleIdSchema,
  /** The role's stable bot identity (`harness/roles.ts`'s `RoleDef.displayName`), never derived from the model. */
  displayName: z.string().min(1),
  tier: tierIdSchema,
  slot: subagentSlotSchema,
  /** The concrete registry entry that served the run's most recent call so far — the primary until a fallback ever takes over. */
  modelId: z.string().min(1),
  modelName: z.string().min(1),
  /** Actual selected entry's reasoning configuration; absent on historical records. */
  effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
  status: subagentRunStatusSchema,
  /** One-liner for "current activity" while the run is still going (design.md decision 16); the terminal `summary` once it ends. */
  activity: z.string(),
  /** Completed steps so far, out of the role's own `maxSteps` ceiling. */
  steps: z.number().int().min(0),
  toolCalls: z.array(subagentToolCallSchema).max(MAX_TOOL_CALLS_PER_RECORD),
  /** Deduplicated paths this run has successfully written, replaced or deleted, first-seen order (a repeat write to the same path does not re-add or reorder it). */
  edits: z.array(z.string()).max(MAX_EDITS_PER_RECORD),
  /**
   * What the run actually did, in ARRIVAL order — reasoning, text and tool
   * entries interleaved as they happened. `toolCalls` above is the flat list
   * callers read today (`run-tasks.ts`'s own `wroteAnyFile`) and `summary` is
   * the terminal report; this is the ordered story between prompt and report,
   * and it does not replace either of them.
   *
   * `.default([])` so a record persisted before this field existed still
   * parses: `collectSubagentRuns` drops anything that fails to parse
   * outright, and an old run's `summary` is still worth keeping with no
   * recorded narration alongside it.
   */
  timeline: z
    .array(subagentTimelineEntrySchema)
    .max(MAX_TIMELINE_ENTRIES)
    .default([]),
  tokens: subagentRunTokensSchema,
  /** The skills pushed into this run's own instructions — a role's defaults, plus any per-task extras a dispatch tool added. */
  skills: z.array(z.string()),
  /**
   * The text the orchestrator handed this sub-agent — `run-subagent.ts`'s
   * own `promptToText` reduction of its `prompt` input to plain text (text
   * parts only; an image or file part carries nothing renderable here),
   * truncated to `MAX_PROMPT_CHARS`. `.default("")` so a record persisted
   * before this field existed still parses — `collectSubagentRuns` drops
   * anything that fails to parse outright, and an old run's `summary` is
   * still worth keeping even with no recorded input alongside it.
   */
  prompt: z.string().default(""),
  /** The run's own final text once it ends; empty while still in progress. */
  summary: z.string(),
})

export type SubagentRunRecord = z.infer<typeof subagentRunRecordSchema>

/**
 * Finds every raw, untrusted value that LOOKS like it could be a
 * `SubagentRunRecord` inside one dispatch tool's output — live or persisted
 * — without importing any dispatch tool's exact result shape: `explore`,
 * `plan` and `verify`'s own final yield carries one `record` alongside
 * `envelope` (`run-subagent.ts`'s `RunSubagentResult`), `run_tasks`' own
 * final `{ outcomes: [...] }` batches one `record` per task, and its
 * PRELIMINARY `{ runs: [...] }` (unit 10b's correction) already holds one
 * bare record per still-dispatched task directly. Reading structurally means
 * this keeps working unchanged if a dispatch tool's own result shape changes
 * around these field names.
 *
 * `value` itself is also a candidate: `explore`/`plan`/`verify`'s own
 * preliminary output is a bare `SubagentProgress`, no wrapper at all.
 */
function candidateRecords(raw: unknown): unknown[] {
  if (typeof raw !== "object" || raw === null) return []

  const value = raw as Record<string, unknown>
  const found: unknown[] = [value]

  if (value.record !== undefined) found.push(value.record)

  if (Array.isArray(value.outcomes)) {
    for (const outcome of value.outcomes) {
      if (typeof outcome !== "object" || outcome === null) continue

      const record = (outcome as Record<string, unknown>).record
      if (record !== undefined) found.push(record)
    }
  }

  if (Array.isArray(value.runs)) found.push(...value.runs)

  return found
}

/**
 * Extracts every valid `SubagentRunRecord` out of a thread's raw, untrusted
 * dispatch-tool outputs — the CURRENT tool-output value each `explore`,
 * `plan`, `run_tasks` or `verify` call carries, live (a bare, still-running
 * `SubagentProgress`) or persisted after reload (the final `record`/
 * `outcomes[].record` wrapper). A value that fails to parse (an older run
 * recorded before this shape existed, a task/call that was rejected before
 * ever dispatching a sub-agent, or genuinely malformed data) is dropped
 * rather than thrown on.
 *
 * Keyed by `agentId` so a duplicate never appears twice; in practice each
 * dispatched run now persists exactly one final record (unit 9's
 * correction: no more per-run time-series), so this is a safety net against
 * a reused id, not the primary case it was written for.
 *
 * Takes an array of raw outputs, not a single one, so a caller (unit 10b's
 * `tool-parts.ts` wiring) can pass every dispatch-tool tool-output value
 * found across a whole thread's parts in one call.
 */
export function collectSubagentRuns(
  rawOutputs: readonly unknown[]
): SubagentRunRecord[] {
  const byId = new Map<string, SubagentRunRecord>()

  for (const raw of rawOutputs) {
    for (const candidate of candidateRecords(raw)) {
      const parsed = subagentRunRecordSchema.safeParse(candidate)
      if (parsed.success) byId.set(parsed.data.agentId, parsed.data)
    }
  }

  return [...byId.values()]
}
