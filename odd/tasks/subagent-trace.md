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
- **The timeline reuses the thread's treatments instead of growing its own.**
  `reasoning` is `ReasoningBlock` fed a one-entry part array (an entry already
  IS one run of consecutive deltas, so the call site adapts the array and the
  block keeps its meaning); `text` is the shared `Markdown`; `tool` is the line
  the entry already drew. A finished reasoning entry is therefore a closed
  "Thought" disclosure, exactly like the thread's — only a run's current
  (trailing) reasoning entry is open and thinking.
- **The timeline replaces the flat call list, and an empty timeline falls back
  to it.** A record persisted before this work has `timeline: []` and populated
  `toolCalls`; it keeps rendering the old list, unsynthesised, so no thread
  looks worse than it did. `SubagentTimeline` renders nothing at all for an
  empty array rather than an empty shell.
- **Static, not a scroller.** No `MessageScroller`, no auto-scroll, nothing
  interactive beyond the disclosures that already exist: each persisted
  snapshot replaces the whole timeline, so there is no stream to follow.
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
- [x] ST-4 Render: `SubagentTimeline` component wired into `SubagentEntry`,
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

- `pnpm --dir apps/web exec tsx --test components/chat/subagent-entry.test.tsx components/chat/subagent-timeline.test.tsx lib/games/harness/records.test.ts lib/games/harness/narration.test.ts`
  — 39 tests, 39 pass, 0 fail (ST-2, ST-3 and ST-4 together).
- `pnpm --filter web typecheck` — clean.
- ESLint clean on every touched file.
- Prettier clean on `narration.ts`, `narration.test.ts`, `records.ts`,
  `records.test.ts`, `subagent-timeline.tsx`, `subagent-timeline.test.tsx`,
  `subagent-entry.tsx`, `subagent-entry.test.tsx` and this document.
  `run-subagent.ts` already failed `prettier --check` at HEAD (174 lines of
  pre-existing rewrapping) and was left unformatted rather than rewrapped in
  this unit; every line ST-3 added is Prettier-shaped.
- ST-4 added no i18n keys: every string it shows already existed
  (`ChatAgents.trace.*`, `ChatActivity.toolLabels.*`, and `ChatMessages`'
  reasoning labels through `ReasoningBlock`), so `en.json`/`es.json` are
  untouched.
- Live check pending: no browser runtime in this session.

## Pending, honestly

- Show the code being modified (diff per edit). Deferred by the user; needs a
  bounded diff captured from `tool-call` input and a `CodeBlock` that can mark
  added/removed lines. A `tool` timeline entry already carries `toolCallId` for
  that join.
- Nothing here is verified against a live streaming turn: no browser runtime in
  this session, so the render was only exercised through
  `renderToStaticMarkup`. Specifically unverified against a real run: that the
  trailing reasoning entry stops shimmering when the run ends, and that the
  timeline reads well at the thread's width with a long run (100+ entries).
- A finished reasoning entry is a closed "Thought" disclosure, because
  `ReasoningBlock` opens only while its part is streaming. Keeping recorded
  reasoning expanded by default would need an `defaultOpen`-style prop on
  `ReasoningBlock`, which is outside ST-4's edit surfaces; the timeline reuses
  the block untouched rather than forking its markup.
- The commit is the parent's job: nothing in ST-2/ST-3/ST-4 is committed.
