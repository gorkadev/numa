# Chat activity groups with Trace

## Intent and scope

Replace existing multi-call ToolGroup presentation with shadcn Chain of Thought: an expandable summary of observable actions and ordered status-aware steps. Preserve grouping boundaries, single-call markers, questions, subagent entries/inspector, and message order. No reasoning, new events, raw payload rendering, dependencies, or backend changes. Parent reread the full primary example: https://ui.shadcn.com/docs/ai-elements/base/chain-of-thought.md.

## Authorization and delivery

User approved this bounded presentation change. Branch: `feat/chat-activity-trace`. Delivery: `ask-on-risk`; initial forecast 200–350 authored diff lines (advisory). No commit/push/PR authorized; commit evidence pending explicit user request. Preserve pre-existing staged user files; never include them implicitly.

## Tasks

- [ ] T1 — Implement and verify grouped activity with Trace. Implementation and automated/independent checks complete; task remains open for blocked browser validation and commit authorization. Route: delegated writer (multi-file/preparation trigger) and independent verifier (unassessable risk fallback). Commit: none.

## Behavior implemented

- Multi-call Trace summary with ordered nested Trace lines and retained mounted content.
- Automatic expansion while calls are unsettled and collapse when settled, unless manually overridden.
- Localized call/step count, not a misleading distinct-file count; failure count remains visible.
- Step labels and safe input paths reused; no redundant nested disclosure when no additional safe detail exists, and no raw arguments/results/errors exposed.
- Single calls still use ToolMarker. Grouping, questions and subagent inspector untouched.
- Source changes: `apps/web/components/chat/tool-group.tsx`, `tool-group-state.ts`, `tool-group-state.test.ts`, `tool-group.test.tsx`, and `apps/web/messages/{en,es}.json`.

## Verification evidence

Writer: `mvb5cbjg-8-2le6`. Independent verifier: `mvb5fs8y-9-v5ca`, settled with no confirmed candidate-caused code defects.

- RED: new state tests failed because the helper module did not exist before implementation.
- GREEN independently reproduced: `pnpm --dir apps/web exec tsx --test lib/games/tool-parts.test.ts components/chat/tool-group-state.test.ts components/chat/tool-group.test.tsx` — 6 passed, 0 failed.
- Targeted ESLint on the four changed TS/TSX files passed.
- TS/TSX Prettier and whitespace checks passed; parent repeated scoped `git diff --check` successfully.
- Locale JSON parsing and ChatActivity key parity passed. Locale Prettier fails also at HEAD; unrelated reformatting skipped.
- `pnpm --filter web typecheck` fails with exactly the baseline 20 diagnostics in protected `apps/web/lib/highlighter.tsx`: 17 TS2307 missing Shiki modules and 3 TS7006 implicit-any parameters. No new diagnostics; baseline issue not repaired.
- Source/SSR checks support single-to-multi growth, manual override resolution, mounted closed panels, denied/error-result status, localization and payload exclusion. They do not prove browser interaction.
- Native assessment returned `unassessable` because untracked scope was undeclared; its required independent verifier ran. RDD is off clone-local; no native review started or switch changed.
- Protected staged paths/blob identities remained unchanged according to the independent verifier. Protected files: user highlighter/hook, Trace/Code Block, UI package manifest, lockfile, and earlier research document.

## Blocked or pending checks

Browser validation is explicitly pending: `orca status --json` reports runtime not running; browser listing fails with runtime unavailable. No installed alternative automation was found. No installs, real model prompts, game actions, source changes, or successful browser checks were performed by the verifier.

Still validate in a real thread: automatic expansion while running, collapse on completion, manual open/close across updates, keyboard interaction, and responsive label/path truncation. General nested-disclosure state is not a feature claimed here: this slice has plain per-call lines because no additional safe detail was selected.

## Next step

Open a usable browser/runtime and verify the interaction scenarios above before checking T1 off. The code is implemented with automated checks passing apart from documented baseline issues; the feature is not fully browser-verified. No commit made; request explicit user authorization before committing.

## Commits and current verification

- Work-unit commit: `dd6ba02` — feat(chat): group multi-call activity into a Trace summary.
- `pnpm --dir apps/web exec tsx --test components/chat/tool-group.test.tsx components/chat/tool-group-state.test.ts components/chat/subagent-entry.test.tsx components/chat/markdown-code.test.tsx hooks/use-highlighted-code.test.tsx lib/highlighter.test.tsx lib/games/tool-parts.test.ts lib/games/harness/records.test.ts` — 20 passed, 0 failed.
- `pnpm --filter web typecheck` — pass.
- Locale Prettier warns on `en.json`/`es.json`; reproduced on the branch-point blob, so it is pre-existing and not reformatted here.
- Still open: browser interaction checks (expansion while running, collapse on settle, manual override across updates, keyboard). Orca runtime was not running, so no automation was available.
