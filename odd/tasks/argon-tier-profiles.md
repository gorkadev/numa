# Argon Tier Profiles

## Objective
Upgrade the compatible AI SDK provider and configure explicit, static model/reasoning combinations for Numa's tiers. Retire Gemini 3.1 Pro from all active execution paths while preserving non-executable historical metadata.

## Approved profiles
| Tier | strong | mid | light |
| --- | --- | --- | --- |
| pro | gemini-4-argon / medium | gemini-4-argon / high | gemini-4-argon / low |
| balanced | gemini-4-argon / medium | gemini-4-argon / low | gemini-3.8-flash / high |
| fast | gemini-3.8-flash / high | gemini-3.8-flash / medium | gemini-3.5-flash-lite / medium |

Title generation: gemini-3.5-flash-lite / minimal. No dynamic reasoning selection.

## Scope and constraints
- User authorized this exact table, a compatible SDK upgrade, and commits. Preserve the existing September template work separately; its source of truth remains `odd/tasks/game-template-starter-kits.md`.
- Branch: `feat/game-templates`; initial HEAD `1da6a17`. Delivery strategy: `single-pr`, explicitly selected for eventual review. No push, PR, merge, database push, or paid model/Daytona/browser checks authorized.
- Single-threaded source writes. Delegate multi-file behavior changes and command verification; parent owns task transitions and commits.
- Distinct execution entry IDs for provider model + effort; candidate-specific options; retain v4 fallback and legacy thread-to-tier mapping.
- Argon standard USD/M input/output including thinking/cached input: 2/10/0.10 through November 30, 2026; 4/20/0.20 from December 1 UTC. Freeze pricing date/version once per turn, reuse it for every costing call, and persist the returned version. Never reprice stored ledger rows.
- No template runtime fixes, dynamic routing, overrides, type-error suppression, schema changes, or unrelated dependency updates.
- Forecast: old checkpoint exceeds 1,400 tracked diff lines plus intentional assets; model unit roughly 200–400 authored lines plus lockfile. Actual coherent source/tests exceed that advisory forecast; the user selected a single eventual PR, so do not split into incomplete units or code-golf.

## Tasks
- [x] AP-1 Recover, verify, and checkpoint existing template changes — commit `58b2762`.
  - Route: delegated read-only exploration and independent verifier; parent staging/commit. Trigger: large existing multi-file diff, historical recovery, command checks.
  - Engram 228/238 and the local template document reconciled. Old work saved independently; GT-11 remains blocked.
- [ ] AP-2 Implement explicit effort profiles, compatible provider upgrade, and scheduled Argon pricing — in progress, verification passed; commit pending.
  - Route: delegated test-first writer. Trigger: multi-file runtime, pricing, dependency and test changes.
  - Tests cover exact nine profiles and title, effort propagation in streaming/non-streaming candidate calls, active-ID/rate coverage, no active 3.1 Pro, legacy metadata, UTC pricing cutoff, cache/reasoning accounting, and immutable snapshot/version behavior.
  - A separate read-only incident verifier diagnosed the dependency split before repair. Commit only after independent verification and parent spot check.
- [ ] AP-3 Record final verification and work-unit delivery evidence.
  - Route: parent bookkeeping with delegated checks where needed. Retain independent verification results, commit identities, and all skipped/pending live checks; commit final evidence.

## AP-1 evidence
- Recovery safety inspection covered 220 files: 25 tracked changes and 195 untracked. No secret-pattern candidates across 40 relevant text files; no accidental environment/key/log/scratch/symlink candidates. Heuristic scanning is not proof of absence.
- Fresh baseline: web and `@workspace/db` typechecks PASS; inventory/tool-parts tests 3/3 PASS; focused ESLint on 33 changed web files: 0 errors, 1 known Turbo environment warning for `DAYTONA_GAME_SNAPSHOT`; generated Python (10,892 bytes) compiled in memory; diff check PASS.
- DB lint unavailable because of its pre-existing missing flat config. No new live/browser/database checks ran.
- Commit `58b2762`: `feat(games): add versioned starter kits and build verification` (220 files). Large raw line counts include textual glTF/vendor assets; shared APIs made whole-file conceptual splits unsafe.
- Existing schema push was already authorized/applied in September; not repeated. Cube's accepted missing-license risk is not a redistribution grant.
- GT-11 remains blocked: no-template live PASS, Fantasy durable FAIL despite a later standalone PASS, Cube durable UNAVAILABLE plus later real-click FAIL and camera occlusion. The checkpoint does not resolve these failures.

## AP-2 implementation and checks
- SDK exact-release preflight verified Argon recognition and automatic continuation while preserving v4 interfaces. Package-only evidence initially missed workspace message-type incompatibility; the observed application typecheck corrected that assumption.
- Main writer `mv73vyjt-b-94bp`: implemented seven model/effort entry IDs, static profiles, UTC scheduled Argon rates, immutable per-turn pricing snapshot, and ledger cost-version persistence. RED: 1 test passed / 4 failed; initial GREEN: 5/5; expanded coverage: 7/7.
- Initial web typecheck FAIL: React and DB still resolved `ai@7.0.93`, whose provider JSON types conflicted with the new SDK, plus three test type errors. The writer stopped; no failing source was committed.
- Read-only diagnosis `mv745nh9-c-ezt4` established normal published dependency alignment, not root overrides. Repair writer `mv749w0x-f-z8l0` aligned web/DB `ai@7.0.139`, React `4.0.142`, OTel `1.0.139`, Vertex `5.0.111`, Google `4.0.95`, provider `4.0.27`, utils `5.0.59`. OTel participates in Trigger's actual integration. Three tests were repaired through assertion-based narrowing, not unsafe casts.
- Repair GREEN: web and DB typechecks PASS; AI tests 7/7 PASS; existing inventory/tool-parts tests 3/3 PASS; focused ESLint PASS; diff check PASS. Installed versions and no active old Pro registry entry confirmed.
- Native ASSESS after staging reports medium risk, with runtime small-model bias requiring independent verification. RDD is off; no native review was started. Its informational `reviewDue: true` / `slice_budget_reached` does not enable review or delivery.
- Provider-issued continuation, preserved unchanged and not executed while RDD is off:
  `gentle-ai review status --cwd=/Users/gorka/workspace/numa --contract=gentle-ai.review-integration/v2 --next-transition=true`
- Independent full-candidate verifier `mv74e0a1-g-evso`: PASS with no blocking source findings across all 14 intended candidate files. Re-ran 7/7 AI tests, 3/3 existing tests, web and DB typechecks, focused ESLint without diagnostics, and working/staged diff checks; all PASS. Only Node's `module.register()` deprecation warning appeared.
- Independent source inspection confirmed the exact profiles/title, explicit effort forwarding, no active 3.1 Pro, historical metadata unchanged, immutable UTC pricing snapshot, shared stream/final costing snapshot, and persisted returned rate version. Dependencies align without root overrides or new production compatibility casts; schema unchanged.
- Parent spot check: both `git diff --check` and `git diff --cached --check` PASS; read back the primitive frozen snapshot and both `turnPricing.snapshot` callers. No unexpected source mutation.
- Full prior document mirrors were saved at Engram 349 and 228 by bookkeeping worker `mv748fge-e-66mv` and read back by the parent. This document is re-mirrored after updates.
- Live model availability, credentials/region, streaming/tool multi-turn execution, and long-decode E2E are intentionally untested. No increased output budgets or dynamic reasoning are introduced.
- AP-2 work-unit commit: pending.

## Next step
Commit the independently verified AP-2 unit, then record its identity and final delivery evidence in AP-3. Preserve every skipped live API/build/template acceptance check and the inherited GT-11 limitations.
