# Subagent Trace

## Objective

Stop losing a sub-agent's progress in the thread. The inline entry keeps the
prompt and the final report, and between them renders what the run actually did
— reasoning, text, tool calls — in arrival order, instead of only a flat list of
files.

## What the user asked for (their order)

1. Keep the prompt block first.
2. Replace the current file/tool list container with a chat-style block that
   renders the sub-agent's reasoning, what it says, and what it does, in order.
3. Keep the output/report container last.
4. Do NOT use `MessageScroller`. This is not an interactive conversation; it is
   a static render of what happened.
5. Later, separate work: show the code being modified. Explicitly deferred by
   the user on 2026-10-21 — recorded in Engram, `ux/subagent-trace`, and in this
   document's own pending list.

## Problem today

- `run-subagent.ts`'s stream switch handles `tool-call`, `tool-result`,
  `tool-error`, `finish-step` and `abort`. Text and reasoning deltas are
  discarded on purpose; the summary comes from `result.text` at the end.
- Every snapshot is the FULL record, emitted at most every 500 ms
  (`PROGRESS_THROTTLE_MS`).
- `SubagentRunRecord` (`records.ts`) therefore has no field that can hold
  narration: `toolCalls` is a flat list and `summary` is one terminal string.
- The UI renders exactly that: a `Trace` list of tool calls plus a collapsible
  Markdown report.

Superseded by ST-2/ST-3: the record now carries `timeline`, and
`run-subagent.ts` accumulates reasoning and text deltas into it as they
arrive instead of discarding them.

## Design decisions

- **One ordered timeline**, not parallel arrays. `timeline` entries are
  `reasoning | text | tool`; an `edit` entry (with a bounded diff) is designed
  but deferred with the code-visibility work.
- **Coalesce by kind, not by step.** Consecutive deltas of the same kind append
  to the last open entry of that kind instead of creating one entry per chunk.
  "Consecutive" means no `tool` entry in between: a step boundary does NOT
  close a narration entry, so a run that thinks in two steps with nothing in
  between reads as one block. Reasoning between two tool calls still splits
  them, because that is one block per `tool` entry, not per step.
- **Bounded by construction.** The record is re-sent in every preliminary
  snapshot, so narration is capped by entry and by record, trimming the TAIL
  (the newest text is the interesting one) and marking the cut. Every cap is
  enforced unconditionally — a record that fails the schema is a record the UI
  drops, so no entry kind is ever exempt (see Caps).
- **The report is not narration.** The terminal record drops the trailing
  `text` entries that only repeat `summary`, so ST-4 never renders the final
  report twice.
- **Old records keep parsing.** `timeline` defaults to `[]`; `toolCalls`,
  `edits` and `summary` stay for persisted history and for callers that read
  them today (`run-tasks.ts`'s `wroteAnyFile`).
- **Collapsed by default**, except the run in progress — same rule the
  orchestrator's reasoning block already uses.
- **Reasoning availability is a tier fact, not a UI fact.** Argon publishes
  thought summaries only at `high`. On `pro`, `mid` was `argon-medium`, so the
  workers would have shown an empty block; hence the separate one-line change
  (`pro.mid` → `argon-high`) that precedes this work.

## Tasks

- [ ] ST-1 `pro.mid` → `argon-high` so workers publish reasoning on the tier the
      user runs. Route: parent, inline (one profile line plus three test
      expectations).
- [x] ST-2 Record schema: `timeline` with caps, defaults, and tests. Route:
      delegated writer.
- [x] ST-3 Stream accumulation in `run-subagent.ts`: coalesced reasoning/text
      entries, emitted through the existing throttle. Route: delegated writer.
- [ ] ST-4 Render: `SubagentTimeline` component wired into `SubagentEntry`,
      collapsed unless running, no scroller. Route: delegated writer.
- [ ] ST-5 Evidence and commit identities.

## Caps

Exported from `apps/web/lib/games/harness/records.ts` (one place) and applied
by `apps/web/lib/games/harness/narration.ts`:

- `MAX_NARRATION_CHARS_PER_ENTRY` = 4_000, tail-trimmed: the newest characters
  survive and a single leading "…" marks the cut, so the stored string stays
  within the cap, marker included. The cut never splits a surrogate pair — a
  lone surrogate is not valid UTF-16 and `jsonb` rejects it — so a pair
  straddling the window start is dropped whole.
- `MAX_NARRATION_CHARS_PER_RECORD` = 16_000, the oldest narration entries
  dropped whole; a `tool` entry is never dropped for character pressure.
- `MAX_TIMELINE_ENTRIES` = 120, the oldest narration entries dropped first, and
  the oldest `tool` entries dropped only if that is not enough. Tool entries
  are the last thing this cap gives up, not an exemption: a 30-step builder
  settles well over 120 calls, and an over-cap timeline fails the schema, which
  makes `subagentRunsForPart` drop the card mid-run. The invariant is absolute:
  a returned timeline is never longer than 120, whatever its mix of kinds.

## Verification

- `pnpm --dir apps/web exec tsx --test lib/games/harness/records.test.ts lib/games/harness/narration.test.ts components/chat/subagent-entry.test.tsx`
  — 29 tests, 29 pass, 0 fail.
- `pnpm --filter web typecheck` — clean.
- ESLint clean on every touched file.
- Prettier clean on `narration.ts`, `narration.test.ts`, `records.ts`,
  `records.test.ts` and this document. `run-subagent.ts` already failed
  `prettier --check` at HEAD (174 lines of pre-existing rewrapping) and was
  left unformatted rather than rewrapped in this unit; every line ST-3 added
  is Prettier-shaped.
- Live check pending: no browser runtime in this session.

## Pending, honestly

- Show the code being modified (diff per edit). Deferred by the user; needs a
  bounded diff captured from `tool-call` input and a `CodeBlock` that can mark
  added/removed lines. A `tool` timeline entry now carries `toolCallId` for
  that join.
- Nothing here is verified against a live streaming turn.
