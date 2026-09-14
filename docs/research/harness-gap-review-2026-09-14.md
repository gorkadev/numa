# Harness gap review vs gentle-ai (2026-09-14)

Status: findings only. Nothing in `apps/web/lib/games/harness/` or
`apps/web/lib/daytona/` has been changed yet. Every finding below was checked
against the code; citations are `file:line` at the time of writing.

Reference repo: `/Users/gorka/workspace/gentle-ai`.

## Open gaps

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | Verify never plays the game | High | Low-med |
| 2 | No review of game logic | High | Med |
| 3 | No deterministic harness tests | Med | Med |
| 4 | No cross-turn record of outcomes | Med | Low |
| 5 | Worker summary text is never cross-checked | Low-med | Low |
| 6 | Verification cost is fixed, not risk-scaled | Low | Med |
| 7 | No size/cost forecast before dispatch | Low | Low |

Recommended order: 1 + 4 + 5 first (cheap, 1 is the biggest quality win),
then 2, then 3 once the harness stabilizes.

### 1. Verify never plays the game

- `apps/web/lib/daytona/verify-script.ts:116-130`: the headless check
  navigates, waits, collects console/page errors, and takes one screenshot.
  It sends no keyboard or mouse input.
- Consequence: a game that opens on a menu is verified on the menu. Gameplay
  code (movement, collisions, scoring, game over) never runs during verify,
  so its runtime errors never reach the console check.
- Direction: after the first screenshot, press the start key/click the first
  `.hud-button`, hold a few movement keys (WASD/arrows/space) for a few
  seconds, then collect errors again and take a second screenshot. Pass both
  screenshots to the verifier (`apps/web/lib/games/harness/tools/verify.ts`).

### 2. No review of game logic

- The verifier only sees a screenshot; its `VERDICT: fail` can turn a PASS
  into FAIL (`harness/tools/verify.ts:67-80`, `:215-240`), but nobody reads
  the code changes adversarially.
- gentle-ai: blind dual judges with a findings ledger
  (`internal/assets/claude/agents/jd-judge-a.md`, `jd-judge-b.md`,
  `jd-fix-agent.md`) and four review lenses
  (`internal/assets/claude/agents/review-{risk,readability,reliability,resilience}.md`).
- Direction: a read-only reviewer role over the turn's diff focused on game
  logic (restart resets state, collisions, win/lose reachable, disposal),
  findings fed into the single corrective `run_tasks` pass verify already
  allows.

### 3. No deterministic harness tests

- There are no `*.test.ts` files under `apps/web` outside `node_modules`.
- gentle-ai drives its real orchestrator prompt with scripted model fixtures:
  `docs/testing-agents-deterministically.md:43-100`.
- Worth covering: ownership-disjoint scheduling
  (`harness/tools/run-tasks.ts:564`), plan validation
  (`harness/plan-validation.ts`), verify call cap
  (`harness/tools/verify.ts:22`), orchestrator read cap
  (`trigger/chat.ts:135-156`), and the wrap-up partial downgrade
  (`harness/run-subagent.ts:46-96`).

### 4. No cross-turn record of outcomes

- `turnState` is reset every turn (`harness/turn-state.ts:227-244`).
- Only the plan survives: `.numa/design.md` and `.numa/tasks.json`
  (`harness/plan-store.ts:36-54`, read back at `:80-97`).
- A new turn cannot know that a task failed or was left partial, or why.
- gentle-ai: apply-progress continuity that merges previous progress
  (`sdd-orchestrator-workflow.md:205-207`).
- Direction: write `.numa/progress.json` (task id, status, files edited,
  one-line reason) at the end of `run_tasks`, and give it to the planner or
  orchestrator on the next turn.

### 5. Worker summary text is never cross-checked

- `edits` are trustworthy: they are recorded from real write tool calls
  (`harness/run-subagent.ts:501`), not taken from the worker's claims.
- The free-text `summary` (`harness/run-subagent.ts:554`) is shown to the
  orchestrator as-is. Nothing flags a summary that claims work while `edits`
  is empty, or names files that are not in `edits`.
- gentle-ai: the orchestrator gatekeeper re-validates every phase result
  (`sdd-orchestrator-workflow.md:77-95`).
- Direction: in `renderOutcomes` (`harness/tools/run-tasks.ts`), flag
  `done` with zero edits for a task that owns files, and file paths mentioned
  in the summary that are missing from `edits`.

### 6. Verification cost is fixed, not risk-scaled

- `MAX_VERIFY_CALLS_PER_TURN = 2` (`harness/tools/verify.ts:22`) applies
  identically to a color tweak and a gameplay rewrite.
- gentle-ai scales verification by assessed risk (passive/medium/high,
  `docs/review-integration.md`).

### 7. No size/cost forecast before dispatch

- `harness/tools/plan.ts` and `harness/plan-validation.ts` compute no
  estimate before `run_tasks`.
- gentle-ai: review workload forecast in
  `internal/assets/skills/sdd-tasks/SKILL.md:144-178`.

## Not gaps (deliberate or already fine)

- Orchestrator read budget is enforced in code (`trigger/chat.ts:135`);
  gentle-ai's is prompt-only.
- The plan is machine-validated (cycles, unknown deps, ownership overlap,
  `harness/plan-validation.ts`), stronger than gentle-ai's markdown tasks.
- Workers cannot ask the player; only the orchestrator can
  (`harness/ownership.ts:79-82`). By design.
- Models are chosen by slot (strong/mid/light), never by id per role
  (`harness/roles.ts:22-24`). A deliberate simplification.

## Rejected claims (checked and false)

- "Skills are silently truncated at 6,000 chars" (`harness/tools/load-skill.ts:14`):
  the largest skill body is about 4.6k chars (`engine-reference`), so the cap never fires.
- "Validate that files a worker claims to have written exist": `edits` already
  come from real tool calls (see gap 5).

## Already done in this review: game-agent skills

Uncommitted changes in `apps/web/lib/games/skills/` (8 files):

- The engine follows three.js r185 best practice; no contradictions with the
  `threejs-*` skills.
- The skills now document real options and returns they hid: `addLighting`
  options, per-rig camera returns (the old text wrongly said all return
  `{ dispose }`), `positionHalfLife`/`lookHalfLife`, the `spring()` handle,
  `tone`/`noise` options with `delay`, `SCALES`/`noteToHz`, `addBloom`'s
  return, particle/HUD options, and extra math helpers.
- `engine-reference` has a full MENU → PLAYING → OVER → restart example with
  no leaks: it tears down the `spin`/`float` stop functions and calls
  `disposeObject`. The old example leaked those update handlers. There is also
  a pooling section.
- `visuals` now gets `engine-movement` by default (`skills/registry.ts`),
  because its focus includes the camera (`instructions/roles/worker.ts:52-54`).
- Verified: `pnpm typecheck` clean; lint clean; every documented identifier
  exists; the worked example parses. Not yet validated by generating a real
  game.

Remaining skill idea (not done): the hand-written skills and the
auto-generated `engineApiIndex` (`instructions/engine-index.ts`) overlap. The
index gives signatures only (`options = {}`) without option keys, so both
are kept for now.
