# Argon EU Routing

## Objective and authorization
User authorized resuming Argon-only Vertex EU routing and local commits (Engram 362). Fix unsupported `europe-west1` for `gemini-4-argon` without changing Flash/Lite. Original completed profiles/pricing: `odd/tasks/argon-tier-profiles.md`, Engram 349.

## Scope and constraints
- Branch `feat/game-templates`; clean initial HEAD `f7647b6`; preserve `58b2762` and `51530b7`.
- Preserve default googleVertex/environment for Flash/Lite, credentials, cache identity, effort forwarding, fallback and pricing. No registry/dependency/schema/environment changes.
- Standard-auth Vertex 5.0.111 maps `createGoogleVertex({ location: "eu" })` to EU hostname/resource. Express-mode API-key routing differs; deployed auth, IAM and availability unverified.
- No push, PR, merge, paid API, Daytona, browser, database push or live checks. Single-threaded writes.
- Inherited delivery strategy `single-pr`; forecast 100–200 authored diff lines; one coherent fix/test work unit.

## Tasks
- [x] AR-1 Implement, verify and commit Argon-only EU provider routing — `ebd6806`.
  - Delegated writer mandatory: runtime plus tests; parent owns commits/progress, ASSESS decides independent verification.
  - Allowed source surfaces: `apps/web/lib/ai/models.ts`, `apps/web/lib/ai/models.test.ts`.
  - Acceptance: all Argon efforts EU, Flash/Lite default, lazy construction, repeated cache reuse/distinct entry identity, unchanged effort options.
  - Checks: `pnpm --filter web exec tsx --test lib/ai/models.test.ts lib/ai/model-registry.test.ts lib/ai/fallback-model.test.ts lib/ai/model-catalog.test.ts lib/ai/pricing.test.ts`; `pnpm --filter web typecheck`; `pnpm --filter web exec eslint lib/ai/models.ts lib/ai/models.test.ts`; working/staged diff checks.
  - Rollback: routing and focused tests only; prior profiles/pricing unaffected. Live runtime check unavailable without separate authorization.

## Evidence and progress
- Recovery reconciled Engram 349/359/362 and original task file; clean Git confirmed. Explorer `mv74y17v-1-gnqt` mapped provider/cache boundary and standard-auth EU SDK behavior; parent spot read confirmed it.
- RDD freshly checked off (clone-local); no native review. Staged ASSESS medium + runtime small-model bias requires independent verification, reviewDue false/under_budget, candidate not consumed. Initial staged candidate 3 files, 151 diff lines.
- Writer `mv750t8i-2-jdko`: observed RED 8 passed/2 failed before runtime changes, then GREEN 10/10. Web typecheck initially failed TS2352 (fixture missing displayName); remaining checks stopped, no commit.
- Repair `mv753os4-3-g40m`: typed entry fixture repaired without ModelEntry cast. All four required commands PASS (10 tests, types, lint, diff).
- Independent verifier `mv75573r-5-mnnn`: all five commands PASS (10 tests, types, lint, both diff checks); runtime routing/SDK mapping confirmed. Delivery findings: test model mock still double-casts to LanguageModel; staged doc evidence stale versus updated worktree.
- Correction `mv756ynv-6-4fv1`: replaced double cast with installed `ai/test` MockLanguageModelV4; all four writer checks PASS.
- Final independent verifier `mv7589pv-7-rznd`: PASS, 10 tests/0 failures/0 skips, web types, ESLint and both diff checks. No unsafe casts; source/worktree/index hashes match. DEP0205 Node deprecation warning only.
- Parent source diff spot read and working/staged diff checks PASS. Final bookkeeping has no meaningful RED; structural diff checks apply. Work-unit commit `ebd6806` (`fix(ai): route Argon through Vertex EU multi-region`), 3 files / 152 diff lines; tree clean immediately afterwards. No production build or repository-wide suite run.

## Next step
Local implementation is independently verified and committed. Next optional check, requiring separate authorization, is a bounded real Argon request with standard Vertex authentication. No live model access or deployed endpoint success is claimed; publishing remains a user decision.
