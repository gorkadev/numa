import {
  MAX_NARRATION_CHARS_PER_ENTRY,
  MAX_NARRATION_CHARS_PER_RECORD,
  MAX_TIMELINE_ENTRIES,
  type SubagentTimelineEntry,
} from "./records"

/**
 * The pure half of the ordered timeline (`odd/tasks/subagent-trace.md`'s ST-3):
 * what one streamed part does to a run's narration, with no I/O, no React and
 * no `ai` import, so it is testable without mocking a `ToolLoopAgent`.
 * `run-subagent.ts` is the only producer and calls `applyTimelineDelta` once
 * per `reasoning-delta`, `text-delta`, `tool-result` and `tool-error` part.
 *
 * Every function here is immutable: it returns a NEW array and never mutates
 * the one it was handed, which is what lets a throttled snapshot keep its own
 * copy of the timeline (`run-subagent.ts`'s `snapshot()`) while later deltas
 * keep accumulating into the runner's own variable.
 */

/** The two narration kinds — everything in the timeline that is not a `tool` entry. */
export type NarrationKind = "reasoning" | "text"

/** A `tool` timeline entry, narrowed out of the union. */
export type ToolTimelineEntry = Extract<SubagentTimelineEntry, { kind: "tool" }>

/**
 * What one stream part contributes. An alias, not a parallel declaration: a
 * delta IS exactly the entry it opens, so the union can only ever drift from
 * `records.ts`'s one by being written out a second time here.
 */
export type TimelineDelta = SubagentTimelineEntry

function isNarration(
  entry: SubagentTimelineEntry
): entry is Exclude<SubagentTimelineEntry, ToolTimelineEntry> {
  return entry.kind !== "tool"
}

function narrationEntry(
  kind: NarrationKind,
  text: string
): SubagentTimelineEntry {
  return kind === "reasoning"
    ? { kind: "reasoning", text }
    : { kind: "text", text }
}

/**
 * Caps one narration string by TAIL trim — the newest characters survive,
 * because the tail is what the model said last, and a single "…" marks the
 * cut. The cap bounds the returned string outright (marker included), which
 * is what `records.ts`'s `MAX_NARRATION_CHARS_PER_ENTRY` documents and
 * enforces on the schema side.
 *
 * The cut never lands between the two halves of a surrogate pair. A lone
 * surrogate is not valid UTF-16 text, and the record is persisted into a
 * `jsonb` column, which rejects it — so a trim in the middle of an emoji
 * would turn a stored run into an unreadable one. When the window would start
 * on a low surrogate the whole pair is dropped (the cut moves one LATER), not
 * the low half alone: starting one EARLIER would keep the pair but need one
 * character more than the cap has room for, marker included.
 */
function trimNarration(text: string): string {
  if (text.length <= MAX_NARRATION_CHARS_PER_ENTRY) return text

  let cut = text.length - (MAX_NARRATION_CHARS_PER_ENTRY - 1)
  const first = text.charCodeAt(cut)

  if (first >= 0xdc00 && first <= 0xdfff) cut += 1

  return `…${text.slice(cut)}`
}

/** Total narration characters in one timeline — the number `MAX_NARRATION_CHARS_PER_RECORD` bounds. */
function narrationChars(timeline: readonly SubagentTimelineEntry[]): number {
  let total = 0

  for (const entry of timeline) {
    if (isNarration(entry)) total += entry.text.length
  }

  return total
}

/** Re-applies the per-entry cap to every narration entry, which matters when a caller hands `capTimeline` its own hand-built timeline. An entry already inside the cap keeps its own identity, so applying this on every delta costs no object churn. */
function trimEntries(
  timeline: readonly SubagentTimelineEntry[]
): SubagentTimelineEntry[] {
  return timeline.map((entry) => {
    if (!isNarration(entry)) return entry

    const text = trimNarration(entry.text)

    return text === entry.text ? entry : narrationEntry(entry.kind, text)
  })
}

/**
 * The record-wide CHARACTER cap: drop the oldest narration entries whole
 * until the rest fits, never a `tool` entry (its data is not recoverable from
 * anywhere else in the record). A lone narration entry that still exceeds the
 * budget is tail-trimmed to the tighter of the two caps rather than dropped —
 * an empty timeline would lose the only thing the run had to say.
 *
 * Non-narration entries contribute nothing to the total, so the "one entry
 * still over budget" case can only be a timeline whose narration is that
 * single entry.
 */
function capNarrationChars(
  timeline: readonly SubagentTimelineEntry[]
): SubagentTimelineEntry[] {
  let total = narrationChars(timeline)
  if (total <= MAX_NARRATION_CHARS_PER_RECORD) return [...timeline]

  const next = [...timeline]
  let narrationLeft = next.filter(isNarration).length

  for (
    let index = 0;
    index < next.length &&
    total > MAX_NARRATION_CHARS_PER_RECORD &&
    narrationLeft > 1;
  ) {
    const entry = next[index]

    if (entry === undefined || !isNarration(entry)) {
      index += 1
      continue
    }

    next.splice(index, 1)
    total -= entry.text.length
    narrationLeft -= 1
  }

  if (total <= MAX_NARRATION_CHARS_PER_RECORD) return next

  // Only one narration entry is left, and it alone is over the budget.
  const onlyNarration = next.findIndex(isNarration)

  if (onlyNarration !== -1) {
    const entry = next[onlyNarration]

    if (entry !== undefined && isNarration(entry)) {
      next[onlyNarration] = narrationEntry(
        entry.kind,
        trimNarration(entry.text)
      )
    }
  }

  return next
}

/**
 * The record-wide ENTRY cap: over `MAX_TIMELINE_ENTRIES`, the oldest
 * narration entries go first; if dropping every narration entry still leaves
 * the timeline over the ceiling, the oldest `tool` entries go too. A `tool`
 * entry is the last thing this cap gives up, but it is not exempt — a run can
 * settle more calls than the timeline has slots (see `records.ts`'s
 * `MAX_TIMELINE_ENTRIES`), and returning an over-cap timeline would make the
 * record unparseable and the UI drop it.
 *
 * So the invariant is unconditional: the returned array is never longer than
 * `MAX_TIMELINE_ENTRIES`, whatever the mix of kinds.
 */
function capEntryCount(
  timeline: readonly SubagentTimelineEntry[]
): SubagentTimelineEntry[] {
  let overflow = timeline.length - MAX_TIMELINE_ENTRIES
  if (overflow <= 0) return [...timeline]

  const next = [...timeline]

  // Two passes: oldest narration first, then oldest tool entries if that was
  // not enough on its own.
  for (const dropNarration of [true, false]) {
    for (let index = 0; index < next.length && overflow > 0; ) {
      const entry = next[index]

      if (entry === undefined) break
      if (isNarration(entry) !== dropNarration) {
        index += 1
        continue
      }

      next.splice(index, 1)
      overflow -= 1
    }
  }

  return next
}

/**
 * Applies every record-wide cap (`MAX_NARRATION_CHARS_PER_RECORD`,
 * `MAX_TIMELINE_ENTRIES`, and the per-entry ceiling on anything a caller
 * built by hand). Idempotent, and already applied by `applyTimelineDelta`, so
 * the runner never has to remember to call it — exported for the tests and
 * for any future caller that assembles a timeline itself.
 */
export function capTimeline(
  timeline: readonly SubagentTimelineEntry[]
): SubagentTimelineEntry[] {
  return capEntryCount(capNarrationChars(trimEntries(timeline)))
}

/**
 * The finalization step: drop the trailing run of `text` entries that merely
 * repeat the report.
 *
 * `run-subagent.ts` sets `summary` from `result.text`, which is exactly the
 * text its `text-delta` parts accumulated into the timeline — so without this
 * the same bytes are stored twice and ST-4 renders the final report twice.
 * Only the TRAILING run of `text` entries is considered (a `tool` entry ends
 * the run), and only entries whose text is a suffix of `summary`: an aborted
 * or failed run, whose `summary` is `"Cancelled."`/an error message, keeps its
 * narration untouched. A timeline with no `text` entries comes back as-is.
 *
 * Only the terminal record is finalized. A live snapshot skips this, so a run
 * in flight keeps streaming its text.
 */
export function stripSummaryFromTimeline(
  timeline: readonly SubagentTimelineEntry[],
  summary: string
): SubagentTimelineEntry[] {
  const next = [...timeline]

  while (next.length > 0) {
    const last = next.at(-1)

    if (last === undefined || last.kind !== "text") break

    /**
     * A tail-trimmed entry kept only its newest characters behind a "…"
     * marker, and those are still a genuine suffix of the report. The marker
     * is only a marker when the entry is exactly at the per-entry cap, so a
     * model that literally starts its text with "…" is not misread.
     */
    const trimmed =
      last.text.length === MAX_NARRATION_CHARS_PER_ENTRY &&
      last.text.startsWith("…")
    const text = trimmed ? last.text.slice(1) : last.text

    if (text.length === 0 || !summary.endsWith(text)) break

    next.pop()
  }

  return next
}

/**
 * One stream event, folded into the timeline.
 *
 * - A narration delta appends to the LAST entry when that entry is the same
 *   kind, and opens a new entry otherwise. "Consecutive" means no `tool`
 *   entry in between, so `reasoning → tool → reasoning` is three entries and
 *   `text → text` — even across two steps — is one.
 * - A `tool` delta is appended where the call settled, carrying the same
 *   data the matching `toolCalls` entry carries.
 * - Every result is capped: a coalesced run of deltas cannot grow past
 *   `MAX_NARRATION_CHARS_PER_ENTRY`, and neither the character nor the entry
 *   record cap can be exceeded by appending. An empty delta is a no-op, since
 *   a provider is free to stream one.
 */
export function applyTimelineDelta(
  timeline: readonly SubagentTimelineEntry[],
  delta: TimelineDelta
): SubagentTimelineEntry[] {
  if (delta.kind === "tool") {
    return capTimeline([...timeline, delta])
  }

  if (delta.text.length === 0) return [...timeline]

  const last = timeline.at(-1)
  const next =
    last !== undefined && last.kind === delta.kind
      ? [
          ...timeline.slice(0, -1),
          narrationEntry(delta.kind, trimNarration(last.text + delta.text)),
        ]
      : [...timeline, narrationEntry(delta.kind, trimNarration(delta.text))]

  return capTimeline(next)
}
