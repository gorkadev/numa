# Show reasoning in the chat thread

## Objective

Render the model's reasoning as its own block in the thread, using the installed
shadcn Reasoning primitive, so a turn shows what the agent was thinking before
it answered.

## Problem and why

Decision 18's registry sent `thinkingConfig.thinkingLevel` on every call, so the
model reasoned but never returned it: `includeThoughts` was never set. A direct
provider probe on 2026-10-20 confirmed the flag works and that AI SDK 7 already
forwards `reasoning-start` / `reasoning-delta` / `reasoning-end`, that
`games.messages` (untyped `jsonb` of `UIMessage[]`) persists those parts, and
that nothing renders them because `groupParts` keeps only text, tools, agent and
ask blocks.

The request side landed in `bae0cce`. This task closes the display side.

## Scope

In scope:

- Install the shadcn `Reasoning` primitive into `packages/ui`.
- Group `reasoning` parts into their own block and render them between text.
- Keep existing text/tool/agent ordering untouched.
- Localized labels; no fabricated duration (the SDK reports no timing).

Out of scope:

- Sub-agent reasoning. `run-subagent.ts` skips reasoning deltas and persists
  only `result.text` as `summary`; making that available needs a capture change,
  not a rendering change.
- Persistence changes: reasoning parts already survive reload and resume.

## Tasks

- [x] R1 — No install needed. `base-rhea` ships no standalone Reasoning
  component: the documented composition is `Trace` + `TraceCollapsible`, and
  those primitives were already installed by the activity Trace work. The block
  is composed locally in `apps/web/components/chat/reasoning-block.tsx`.
- [x] R2 — Grouping and rendering landed, with tests.
- [x] R3 — Automated verification passed; a real streamed turn and browser
  interaction remain unverified.

## Constraints

- One writer, one work-unit commit per coherent unit.
- Preserve the existing block ordering contract: reasoning shows where it
  arrived, never hoisted above or below unrelated blocks.
- No invented timing, no truncated-but-relabelled text, no hidden-token claims.

## Verification

- `pnpm --dir apps/web exec tsx --test` over the chat grouping/rendering tests.
- `pnpm --filter web typecheck`.
- Prettier on the touched TS/TSX files (locale JSON warnings are pre-existing at
  the branch point and stay untouched).

## Implementation and verification

- Work-unit commit: `52d2430` — feat(chat): show the agent's reasoning in the thread.

`PartBlock` gained a `reasoning` kind that folds consecutive reasoning parts into
one block at arrival position; `isProducing()` counts it while any part streams.
`ReasoningBlock` renders one `Trace` line per part, opens while live, yields to
the reader's toggle, and shows no duration.

The independent audit found no blocking defect and one real bug: an aborted
stream never emits `reasoning-end`, so a persisted part keeps
`state: "streaming"` and would spin forever, including after reload. The running
state now requires both the part's state and the row's live flag. Whitespace-only
text no longer opens an empty panel, and the Spanish pair is parallel
(`Pensando` / `Pensamiento`).

- RED then GREEN: 3 failing tests to 20/20 on the focused suite.
- `pnpm --filter web typecheck` — clean.
- ESLint and Prettier clean on all touched TS/TSX files.
- Locale JSON Prettier still fails at the branch point, untouched.

Pending, honestly:

- No turn has streamed since the change, so the end-to-end path
  registry to Trigger to UIMessage to this block is proven per layer, not by one
  observation.
- Disclosure interaction (focus, keyboard, manual toggle across streamed
  updates) is unverified without a browser runtime.
- Nothing in CI runs `tsx --test`; there is no `test` script in
  `apps/web/package.json` and no workflow, so these tests only run when invoked
  by hand.
