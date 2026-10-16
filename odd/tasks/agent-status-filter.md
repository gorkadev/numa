# Agent status filter

## Intent
Add a compact All / Active / Finished selector above the right sidebar Agents list. Default: All. Active means running; Finished includes all other recorded outcomes. Preserve ordering, live updates and selected detail across filtering. Match existing UI and English/Spanish localization, narrow and wide layouts; show a contextual empty state.

## Scope and constraints
Only sidebar filtering, a small pure filtering helper with tests, and additive ChatAgents locale entries. Preserve pre-existing dirty files, including both locale dictionaries. No status schema changes, dependencies, publishing or commits without explicit user request.

## Delivery
One bounded work unit, forecast 150–250 authored changed lines; strategy ask-on-risk. No commit authorized; commit evidence pending explicit request.

## Tasks
- [x] T1 Implement filter and deterministic tests. Route: delegated gentle-ai-worker; multi-file write trigger. Status: implemented and self-verified; no commit authorized.
- [x] T2 Verify behavior, types, lint and visual feasibility. Route: gentle-ai-verify (native assessment unassessable, independent verification required). Status: automated/static verification passed; browser feasibility checked.
- [x] T4 Replace bespoke filter controls with existing ToggleGroup/ToggleGroupItem and built-in variants only; no custom visual styling. User-authorized correction. Route: bounded worker, then independent focused verification. Status: verified. Uses outline/sm/spacing=0, controlled single selection with ignored deselection; no custom visual classes, radios or useId. Worker typecheck passed; worker and independent verifier passed 8/8 focused tests and targeted ESLint. Structural primitive replacement, no meaningful new RED. No commit authorized.
- [ ] T3 Visually validate narrow/wide layout and keyboard interaction in an authenticated browser. Status: pending; local server redirects to sign-in and no accessible browser automation is configured.

## Acceptance and checks
All preserves all runs; Active includes running only; Finished includes done/partial/blocked/error/aborted/skipped/unavailable. Selected run detail resolves against all records. Empty filtered list has a localized message. Both responsive presentations share filter state. Keyboard-accessible single-select controls. Run focused Node tests (observe RED then GREEN), web typecheck and lint. Attempt browser verification if available; record limitations honestly.

## Evidence
Exploration: AgentsTabBody in apps/web/components/chat/side-panel.tsx; records status model in apps/web/lib/games/harness/records.ts. Existing nearby tests use node:test and direct .ts imports. Both message dictionaries contain unrelated user changes.

## Verification progress
Worker observed RED (missing helper module), then GREEN: 8/8 focused tests. Web typecheck passed; lint passed with 89 unrelated warnings. Final worker edit was JSX formatting. Parent diff spot check confirms shared filter state, native radio controls, selected lookup against all records, additive locale keys with existing game-template changes preserved. Native assessment unavailable because unrelated untracked scope lacks declaration; conservatively route independent verification without altering review authority. Browser appearance not yet verified.

## Independent verification
- `node --experimental-strip-types --test apps/web/components/chat/agent-run-filter.test.ts apps/web/components/chat/agent-run-presentation.test.ts`: 8/8 passed on final tree.
- `pnpm --filter web typecheck`: passed.
- `pnpm --filter web lint`: passed, 0 errors and 89 warnings outside filter scope.
- Static review: correct classification across eight statuses, preserved ordering/live recomputation, shared state, unfiltered selected lookup, native radios and matching locale keys.
- Minor follow-up: narrow detail reuses existing “All runs” back label although it returns to the filtered list; no behavioral blocker.
- Browser attempt: port 3000 responds 307 to /sign-in; Playwright/Puppeteer not locally resolvable; Orca not running/reachable. No rendered visual/responsive/keyboard verification or auth attempted. No changes made by verifier.

## Next step
User can open an authenticated chat and inspect the Agents selector in wide/narrow layouts. T3 remains pending, not claimed complete. No commits created. RDD remains off.
