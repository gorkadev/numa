# Orchestrator Dispatch

Objective: the orchestrator writes and dispatches the task list itself (no planner sub-agent on the build path), and the engine stops being re-read by every agent.
Branch: `feat/orchestrator-dispatch` (stacked on `fix/harness-run-failures`). Delivery: ask-on-risk; forecast ~600 authored lines, chain strategy to be asked at delivery. Test runner: `pnpm --dir apps/web exec tsx --test <file>`.

## Specs

- S1 — "el orquestador podría hacer el mismo el reparto": `run_tasks({ tasks })` is the normal way to dispatch, no plan required. Before anything starts it rejects, with a correctable error: a dependency cycle, a `dependsOn` naming neither a task in the batch nor one finished this turn, an `owns` under `engine/`, `vendor/` or `.numa/`, and overlapping `owns` with no `dependsOn`. A fresh build with a selected template must carry an `assetReceipt`, validated against the template's asset catalog and persisted where `verify` reads it. `taskIds` keeps working for an existing plan.
- S2 — The `plan` tool is no longer active for the orchestrator (still declared, so stored `tool-plan` parts keep converting). The orchestrator's instructions tell it to author the tasks (absorbing the planner's task-writing rules), and it receives the template context, its asset catalog and the engine API index.
- S3 — The task strip shows the tasks of the turn's `run_tasks` calls without a `plan` part; threads with a `plan` part render as before.
- S4 — "eso q comentas también del engine q se lee varias veces hay q solucionarlo si": instructions stop inviting agents to read `engine/*.js` and point to the API index and skills; a worker or explorer that reads engine files beyond a small budget gets a refusal pointing to the index and `load_skill`.

## Tasks

- [x] T1 — S1 — inline — `validateDispatch` + `assetReceipt` input persisted by `writeDispatchReceipt`; `tasks` normal, `taskIds` legacy (RED export missing; GREEN 11/11). `run_tasks` execute wiring has no unit test (no harness for the tool).
- [x] T2 — S2 — inline — `RETIRED_TOOLS` keeps `plan` declared but inactive; routing text rewritten (planner rules absorbed: scope, controls, one task by default, fields, 2000-char goal); `orchestratorContextInstructions` adds engine index + template context + receipt line per turn (RED module missing; GREEN 4/4; suite 281/281). The run() wiring in chat.ts has no unit test.
- [x] T3 — S3 — inline — `deriveTaskStrip` takes the latest turn's `run_tasks` bodies (all calls of that turn), legacy `plan` path kept (RED 4 fail; GREEN 6/6)
- [x] T4 — S4 — inline — `engineReadBudget(2)` on every worker read_file; runtime, engine-core and index text point to index + load_skill (RED module missing; GREEN 3/3). Explorer left unbudgeted: reading is its job.

## Log

- L1 (2026-10-25, user, verbatim): "me parece bien si, inspecciona en bbdd, trigger... todo lo que quieras. yo pienso lo mismo: creo q el planificador a dia de hoy es un obstaculo, el orquestador podria hacer el mismo el reparto, esto es lo q dices no? ahora mismo el orquestador llama a un planificador luego se la devuelve por asi decirlo al orquestador y este la lee y entonces delega... para eso q lo haga el orquestador mismo dices? o sea viendo un poco la construccion de estos nuevos juegos, esq creo que se pierde mucho tiempo al empezar antes de hacer nada, varios minutos, dando errores de submit plan... lo q comentas vaya / solucionar eso yo creo, y eso q comentas tambien del engine q se lee varias veces hay q solucionarlo si"
- L2: Evidence (14 days of `turn_usage`): planner 18.7% of spend ($2.71 over 10 turns); of 10 plans with output, 2 timed out, 4 had a single task, 3 split work; recent planners read 11-13 files and had 1-2 rejected submissions each.
- L3: Map (read-only explorer): the planner is the only producer of the template asset receipt (`.numa/plan.json` → `readPlanAssetReceipt` → verify asset policy); the orchestrator gets no template context; `engineApiIndex` (~7.4k chars) exists but is not given to the orchestrator; no tests cover plan-validation, plan-tasks, run-tasks or plan.ts.
- L4: Closing checks T1-T4 — suite 289/290: the one failure is `lib/highlighter.test.tsx` "aliases highlight real tokens…", untouched by this feature, passing twice in isolation (slow test under suite load). tsc clean, eslint 0 errors. Not run: a live build without the planner.
