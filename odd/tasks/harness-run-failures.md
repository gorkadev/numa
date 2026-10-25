# Harness Run Failures

Objective: fix the failures found in the "Toon Trench Survival" post-mortem (game 0123952e, run run_06gmu5up17dtq8tmh3bneg3ba2).
Branch: `fix/harness-run-failures`. Delivery: ask-on-risk, forecast ~400 authored lines. Test runner: `pnpm --dir apps/web exec tsx --test <file>`.

## Specs

- S1 — A worker that ends without writing any file it owns is not reported as done. One retry for that worker; if it still writes nothing, its outcome says so (not `done`). Evidence: builder `t1` ended with `finish_reason: stop`, 0 output tokens, `wroteFiles: false`, status `done`.
- S2 — The length limits of `run_tasks`/`submit_plan` task fields (`goal` ≤1200, `acceptance` item ≤300) are stated in the tool descriptions the model reads. Evidence: 4 `submit_plan` and 3 `run_tasks` rejections "Too big: expected string to have <=1200 characters"; first planner timed out.
- S3 — `verify` is not offered after a `run_tasks` call that changed no game file (a turn that dispatched nothing keeps it, so a player can still ask for a check); after a failed `verify`, the orchestrator may read files (`read_file`, `list_files`) alongside `run_tasks`. Evidence: verify ran on the untouched placeholder and spent 1 of 2 attempts; `AI_NoSuchToolError: Model tried to call unavailable tool 'list_files'. Available tools: run_tasks.`
- S4 — Engine and checker footguns: `addLighting` with an unknown preset throws an error naming the valid presets; `createEngine` mounts into `#app` when it exists and no mount is given; the deterministic browser check reports a game canvas that is mostly outside the viewport. Evidence: `Cannot read properties of undefined (reading 'sky')`; blue screen with canvas below `#app` passed verification.

## Tasks

- [x] T1 — S1 — inline — worker without edits is retried once, then reported partial (RED: module missing; GREEN 5/5)
- [x] T2 — S2 — inline — limits in field descriptions (RED 2 fail; GREEN 3/3)
- [x] T3 — S3 — inline — routing moved to `lib/games/harness/routing.ts`; no verify after an empty dispatch, reads after failed verify (RED module missing; GREEN 7/7)
- [ ] T4 — S4 — inline — engine lighting/mount guards + canvas visibility check

## Log

- L1 (2026-10-24, user, verbatim): "Si porfa divídete el trabajo como consideres y vete arreglándolo" — in reply to the proposed post-mortem fixes (1 tarea vacía, 2 límites, 3 verify/lectura, 4 motor).
- L2: Cost item (orchestrator/planner re-reading the engine) deliberately left out of scope; pending a separate decision.
- L3: S3 narrowed — hiding `verify` whenever nothing changed would also remove it from a turn where the player only asks for a check ("¿por qué se ve azul?"). It now hides only after a dispatch that wrote nothing. Also fixed: `prepareStep` ignored routed lists longer than one tool.
