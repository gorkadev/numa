# Game Template Starter Kits

## Objective

Let a player explicitly choose a versioned starter template when creating a game, defaulting to no template, and provision only that template's approved assets and guidance into the game's offline Daytona sandbox.

## Problem

Every game currently starts from the same procedural runtime. There is no visible template choice, no persisted template identity, and no bounded way to materialize curated assets before the first agent turn.

## Why

Explicit templates give the player predictable control, reduce agent guesswork, and keep asset licensing, transfer cost, and performance boundaries deterministic. A template must be fixed before sandbox provisioning; implicit agent selection would require preloading every pack or adding another classification/provisioning phase.

## Scope

- Add a simple template picker to the home/new-game composer, modeled after the tier picker.
- Default to `No template`; do not expose template switching inside an existing game.
- Persist `templateId` and `templateVersion` on the game row.
- Define a typed, versioned template catalog with `none` and `fantasy-cards`.
- Provision the Fantasy Cards runtime assets only for games that selected that template.
- Add template-specific agent context without weakening global runtime or safety instructions.
- Add the vendored Three.js GLTF loader needed by template games.
- Expose Cube World as a second template, with the user's explicit acceptance of the missing local license evidence and current redistribution risk.
- Fail closed when a selected template's descriptor or manifest is missing from a deployed sandbox seed.
- Require template-aware planning and smaller behavioral work units for full-game builds.
- Strengthen verification beyond a console check and one screenshot with template/gameplay acceptance scenarios.
- Add concise deterministic progress feedback before and during planning, delegated work, and verification.

## Constraints

- Use `pnpm db:push`, never migrations, for the schema change; do not run the destructive/external database command without explicit authorization at the execution point.
- The sandbox has no network and must receive every selected asset before the first model turn.
- Do not add either full source pack to the common runtime seed.
- Use only the Fantasy Cards glTF runtime representation, normalize case-sensitive references, and preserve its CC0 evidence.
- Templates are immutable after game creation.
- Generated technical artifacts and UI copy are in English.
- Do not commit, push, or open a pull request without explicit user authorization.
- Preserve the user's accepted Cube World licensing risk in implementation notes; do not falsely claim the local archive contains a license.

## TDD and verification

- TDD mode: not configured in repository/session; ordinary focused verification applies.
- Exact checks: `pnpm --filter web typecheck`, focused `pnpm --filter web lint -- <changed paths>`, `git diff --check`, and a manifest/reference validation script for copied template assets.
- Runtime browser verification is desirable but may remain pending if no configured authenticated harness is available.

## Delivery strategy

- Strategy: single-pr, explicitly selected by the user on 2026-10-13 for eventual review; no push or PR creation authorized.
- Original template MVP forecast: approximately 450–650 authored source lines; completed but uncommitted.
- Hardening, progress UX, and Cube World expansion forecast: approximately 900–1,300 additional authored source lines; binary/vendor assets excluded.
- The user authorized checkpoint commits on 2026-10-13. A source safety review found that whole-file splitting would create incomplete intermediate states because planning, progress, templates, and verification share APIs; preserve one coherent old-work checkpoint. Its size is explicitly acknowledged, and runtime readiness is not implied.

## Tasks

### GT-1 — Add explicit template selection and persistence — completed (uncommitted)

**Route**
- Delegated direct writer.
- Trigger evidence: multi-file write across UI, catalog, action, route flow, and database schema.

**Outcome**
- A reusable template catalog validates untrusted form/query values.
- The new-game composer shows a template picker with `No template` selected initially.
- The selected template is persisted with its version when the game is created.
- Existing-game composers do not expose template switching.

**Checks**
- Focused typecheck and lint for changed TypeScript/TSX files.
- Structural readback of form validation, redirect behavior, and persisted columns.

**Evidence**
- Writer and independent verifier both passed `pnpm --filter web typecheck`, focused ESLint, and `git diff --check`.
- Structural verification confirmed the picker is supplied only by `NewGameComposer`, invalid form values fall back to `none`, the catalog supplies the stored version, and redirects do not carry template state.
- Native risk assessment was unavailable (empty native output), so the required independent verifier ran and returned PASS with no warning/error findings.
- The schema application was deferred to GT-3 and later completed with explicit user authorization.
- Work-unit commit: pending explicit authorization.

### GT-2 — Provision Fantasy Cards assets and agent guidance — completed (uncommitted)

**Route**
- Delegated direct writer.
- Trigger evidence: coordinated runtime seed/provisioning/instruction changes plus new template files and assets.

**Outcome**
- `fantasy-cards@1` carries a bounded manifest, CC0 evidence, and optimized runtime files.
- Only selected template files are uploaded under the game's asset directory.
- The runtime includes `GLTFLoader` and the agent receives exact semantic asset paths and template constraints.
- A no-template game remains byte-for-byte equivalent to the current common seed behavior apart from persisted metadata.

**Checks**
- Validate every glTF/GLB reference and case-sensitive destination.
- Focused typecheck, lint, and diff checks.
- Verify provisioning reads the persisted template rather than trusting a URL or agent choice.

**Evidence**
- Writer passed web typecheck, focused ESLint, the 34-model exact-case glTF validator, and `git diff --check`.
- Initial independent verification found one manifest-contract mismatch: loader hashes were under `vendor.files` instead of `provenance.three`.
- A one-file correction moved both official r185 source URLs and unchanged SHA-256 hashes to the required schema.
- Full independent re-verification returned PASS: 34 glTF references and both vendored loader hashes validated; no remaining blocking findings.
- Focused ESLint reports one pre-existing/config warning for `DAYTONA_GAME_SNAPSHOT` missing from Turbo environment declarations; no lint errors.
- Work-unit commit: pending explicit authorization.

### GT-3 — Verify the integrated creation boundary — completed (uncommitted)

**Route**
- Delegated verification after native risk assessment, as required with RDD off.

**Outcome**
- Invalid template input safely resolves to no template.
- Template identity survives redirect/reload and drives first-turn sandbox creation.
- Existing games and no-template creation retain current behavior.
- Database push status and any browser-level gaps are reported explicitly.

**Checks**
- `pnpm --filter web typecheck`
- Focused web lint for all changed files.
- `git diff --check`
- Asset manifest/reference validator.
- `pnpm db:push` only after explicit authorization.

**Evidence**
- Integrated independent verification found no source, schema, or provisioning mismatch.
- Web and database typechecks passed; focused web ESLint passed with the existing Turbo environment warning; the 34-model integrated asset/provenance validator passed; `git diff --check` passed.
- The database package's declared lint command is unavailable because `packages/db` has no ESLint 9 flat config; this is a pre-existing package configuration gap, not a source finding.
- Parent spot check re-ran `git diff --check` successfully.
- Runtime/browser creation and Daytona upload remain unverified because no configured authenticated runtime harness was run.
- The user explicitly authorized `pnpm db:push`; Drizzle applied the additive schema successfully and reported `[✓] Changes applied`.
- The command also reported the existing Neon profile-selection notice and PostgreSQL future SSL-semantics warning; neither blocked application.
- Work-unit commit: pending explicit authorization.

### GT-4 — Repair template delivery and enforce template preflight — completed (uncommitted)

**Route**
- Delegated direct writer.
- Trigger evidence: multi-file deployment, seed validation, instruction, and test changes.

**Outcome**
- Hidden template descriptors and manifests are included in Trigger deployments.
- A selected template cannot begin generation when its descriptor, manifest, loader, or required assets are absent.
- Template discovery is deterministic and evidenced before planning.
- Fantasy Cards no longer silently degrades to an asset-only sandbox.

**Checks**
- Build/read the exact additional-files glob behavior, including hidden `.numa` files.
- Focused typecheck/lint and deterministic seed preflight tests.
- Re-provision a disposable template sandbox or equivalent bounded harness if available.

**Evidence**
- Template contracts moved to visible root `TEMPLATE.md` and `ASSETS.json`; `fantasy-cards@1` preflight validates 109 seeded files before Daytona creation.
- Strict Zod schemas reject unknown manifest keys at fixed object levels while keeping provenance path maps intentionally dynamic.
- Preflight verifies persisted id/version, declared asset paths, exact case, loader imports, and vendored SHA-256 provenance.
- Planner instructions now receive server-authored template descriptor and bounded manifest context derived from persisted game identity.
- Writer and independent verifier passed web typecheck, focused ESLint, real `readGameSeed` execution, negative strict-parser checks, the 34-model visible-contract validator, and `git diff --check`.
- No database or Daytona provisioning command ran; the existing Turbo environment warning remained non-blocking.
- Work-unit commit: pending explicit authorization.

### GT-5 — Bound planning and verify playable behavior — completed (uncommitted)

**Route**
- Delegated direct writer, followed by independent verification.
- Trigger evidence: planner contracts, task validation, runtime verifier, and template acceptance behavior span multiple non-trivial files.

**Outcome**
- Full-game plans cannot collapse gameplay, AI, input, assets, and presentation into one giant task without explicit justification.
- Template workers receive and acknowledge the template contract and asset manifest.
- Verification can exercise deterministic gameplay and touch scenarios, not only console output and one screenshot.
- Hidden-information and asset-loading failures become observable blockers.

**Checks**
- Focused tests for task-plan validation and template receipts.
- Scripted browser scenarios for at least one Fantasy Cards turn, hidden-state fairness, reset, and a narrow touch viewport when Chromium is available.
- Existing no-template builds retain their current route.

**Evidence**
- First selected-template builds now require 3–6 reviewable tasks with distinct deterministic gameplay, interactive visuals, and a final gameplay integration unit; every task carries observable acceptance criteria and the integration unit must have a dependency path from all earlier work.
- Historical tasks, later turns, and no-template games retain the prior optional-acceptance behavior.
- Every worker receives server-authored context from persisted template identity plus its acceptance criteria; instructions distinguish receipts from verification evidence.
- Fantasy Cards now declares a strict five-scenario desktop/touch contract covering initial hidden-state safety, card/location selection, primary action, end-turn transition, and observable reset restoration.
- The fixed Playwright script executes the full contract on fresh desktop and touch pages, captures local HTTP/request failures and touch console/page errors, and performs only bounded dotted-path equality polling.
- Malformed template failure output fails closed. The corrected manifest path schema accepts dotted identifiers but rejects indexed/executable paths and unknown keys.
- Writer and independent verifier passed web typecheck, focused ESLint, bounded-plan positive and negative checks, the 109-file real seed preflight, strict parser negatives, Python script syntax compilation, descriptor/manifest parity checks, and `git diff --check`.
- Live Daytona/Chromium execution remains unexercised because the authenticated runtime harness was unavailable and the verification pass was explicitly source-only.
- Work-unit commit: pending explicit authorization.

### GT-6 — Add deterministic build progress feedback — completed (uncommitted)

**Route**
- Delegated direct writer.
- Trigger evidence: Trigger stream events, AI SDK transient data, chat hook state, and pending UI require coordinated multi-file changes.

**Outcome**
- Submission immediately shows an honest local acknowledgment.
- Host-authored transient statuses cover workspace preparation, planning, building, and verification.
- The UI shows one current concise status, falls back safely on reconnect, and preserves existing task/subagent detail.
- Final result prose remains model-authored; progress does not pollute message history.

**Checks**
- Focused typecheck/lint and lifecycle/status reducer tests where supported.
- Verify transient progress is not persisted into `messages`.
- Verify stop, reconnect, error, and no-tool turns clear or replace stale status.

**Evidence**
- Added host-authored transient `data-game-progress` phases for workspace preparation, planning, building, verification, and normal finalization; phase text is never model-authored.
- The client shows one accessible current label beside existing task detail, acknowledges submissions locally before sending, and retains revision/credit stream handling.
- A pure reducer clears terminal/no-tool states, prevents stale `ready` from erasing a fresh submit, uses a reconnect-only fallback, preserves a fresh phase across reconnect completion, and invalidates async reconnect tokens on stop/game changes.
- Both server persistence boundaries and initial client history defensively remove progress parts even though every emitted chunk is transient.
- Finalization is suppressed for stopped/error turns so server completion cannot revive an aborted label; SDK stop remains invoked.
- Malformed historical messages/parts are tolerated without mutation or crashes.
- Writer plus independent verification passed web typecheck, focused ESLint, pure lifecycle/parser/filter checks, structural emission/persistence checks, stop-token checks, and `git diff --check` after two correction rounds.
- Live React/AI SDK/Trigger behavior remains unexercised; reconnect/stop correctness is source- and pure-state-verified only.
- Work-unit commit: pending explicit authorization.

### GT-7 — Add the Cube World template — completed (uncommitted)

**Route**
- Delegated direct writer after GT-4 and GT-5 establish the corrected template contract.
- Trigger evidence: large curated asset seed, manifest/playbook, catalog exposure, and template-specific checks.

**Outcome**
- Cube World appears as an explicit selectable template.
- Only curated glTF runtime assets are shipped; Blend, FBX, and OBJ duplicates remain source-only.
- The template provides a constrained playable vertical-slice foundation and semantic asset/animation manifest rather than only an asset dump.
- Licensing metadata truthfully records that the local archive lacks license evidence and that the user accepted exposure risk.

**Checks**
- Validate every selected glTF, embedded/external dependency, animation declaration, and exact-case path.
- Verify the seed remains isolated from no-template and Fantasy Cards games.
- Exercise one small Cube World generation through the strengthened planner/verifier when possible.

**Evidence**
- Added explicit `cube-world@1` catalog exposure with truthful UI copy that the local pack contains no bundled license evidence; persisted id/version columns already support it, so no schema change or database push was needed.
- Curated exactly five byte-identical, self-contained glTF assets: animated player and goblin plus grass block, tree, and crystal. No Blend, FBX, OBJ, MTL, external bin/texture, preview, atlas, or other source-pack file entered the seed.
- The five selected glTF files total 1,256,428 serialized bytes; their buffers and images remain embedded.
- Added exact declared player and goblin clip inventories with bounded semantic categories, plus categories for all static models.
- Added template-local byte-identical r185 `GLTFLoader.js` and `SkeletonUtils.js` with the previously verified official provenance/hashes and the common local `BufferGeometryUtils.js` dependency.
- Added a strict missing-local-evidence risk record with explicit accepted exposure and no `licenseEvidence`; descriptor and planner context warn without implying a redistribution grant.
- Added a five-step desktop/touch contract for initial exploration, crystal collection, goblin engagement, attack/victory, and observable reset restoration.
- Writer checks and independent verification passed typecheck, focused ESLint, exact source/destination asset parity, embedded-resource and glTF validation, animation parity, strict manifest negatives, real Cube and Fantasy preflights, loader hash/import checks, seed isolation, descriptor/manifest parity, unknown-template rejection, and `git diff --check`.
- Independent result: PASS with WARNs only for the intentionally unexecuted live Daytona/Chromium flow and the accepted unresolved redistribution/license risk.
- Work-unit commit: pending explicit authorization.

### GT-8 — Restore adaptive orchestration and truthful completion — in progress

**Route**
- Read-only incident investigation followed by delegated implementation.
- Trigger evidence: planner schema/instructions, orchestration limits, verification routing, runtime asset policy, and final response truthfulness span multiple non-trivial files.

**Outcome**
- Task count follows actual complexity and cohesion, independent of template selection.
- Templates add resources and constraints; they do not decide whether work is delegated.
- Small cohesive games may remain one task; substantial multi-domain games split into reviewable units with explicit integration.
- Repeated exploratory diagnosis is bounded; one unavailable verification cannot trigger an unbounded loop.
- A turn with changed game files cannot claim verified success after verification remains failed or unavailable.
- Generated template games load only a bounded playable asset subset eagerly and lazy-load optional assets.

**Checks**
- Pure plan cases for small cohesive, substantial no-template, and substantial templated games.
- Tool-budget checks for bounded exploration/correction behavior.
- Finalization checks for pass, fail, unavailable, stopped, and unchanged turns.
- Live regression against the inspected Fantasy sandbox failure mode when available.

**Evidence**
- Incident `e2f1bfc4-1756-4914-8825-fd7a011b500f` used `fantasy-cards@1` and produced four appropriate work units, but loaded 19 glTF models, timed out verification twice, ran fourteen exploratory calls, and still reported success.
- The corrected sandbox later loaded in 3.9 seconds when inspected alone, but the full declarative interaction attempt stalled during asset-heavy startup; this confirms runtime contention and unavailable verification were not safely handled.
- Implemented bounded turn-state routing: two explorer calls per turn, one post-verification `run_tasks` call regardless of input form, and terminal verification outcomes reset per turn.
- `prepareStep` now preserves and invokes Trigger's injected base callback first, detects successful direct and worker writes from accumulated tool results, forces verify/correction/second-verify transitions, and forces an honest no-tool final response at terminal states.
- Turn completion persists a non-transient host-owned `data-game-verification` record with verification outcome, changed-file evidence, unfinished task ids, and `completed`/`blocked`/`unchanged` status; the existing progress-only filter retains it.
- Browser verification now receives only host-derived selected-template eager model paths from an accepted plan receipt and trusted manifest. It records successful initial-page glTF responses before scenarios and fails on receipt/path mismatch or more than six eager models; historical/update/no-receipt turns receive no added asset check.
- Follow-up independent-verifier corrections: terminal routing now appends its host truthfulness rule to AI SDK v7 `instructions` while retaining top-level game and injected instructions; the first failed/unavailable verification exposes an optional correction-only `run_tasks` step; and the durable verification payload streams through `onBeforeTurnComplete` and is replaced/deduplicated before persistence.
- `pnpm --filter web typecheck`, focused ESLint for `trigger/chat.ts`, and `git diff --check` passed. A direct `tsx` pure routing matrix could not load because importing `trigger/chat.ts` initializes the database client and the local process has no injected `DATABASE_URL`; no credentials or environment changes were attempted.
- GT-8B repair: terminal instructions now use AI SDK v7 system-message objects, retain injected providerOptions and legacy `base.system` fallback, avoid exact duplicate game content, and end with host truthfulness. The injected prepareStep still runs first and its other fields are spread unchanged.
- `pnpm --filter web typecheck`, `pnpm --filter web exec eslint trigger/chat.ts lib/games/harness/terminal-instructions.ts`, and `git diff --check` passed. A dependency-free `tsx` matrix passed string, object, array/providerOptions identity, legacy fallback, exact duplicate, and final placement cases. Installed ai@7.0.93 source confirms `Instructions` accepts strings or system messages and converts system message `content`/`providerOptions`.
- Follow-up GT-8 repairs are underway: reviewer failures and malformed verdicts no longer promote browser PASS; stopped/error changed turns are blocked; optional correction steps receive the host truthfulness instruction; template initial asset checks require explicit `window.__NUMA_VERIFY_READY__ === true`, bounded network settling, and settled glTF requests before scenarios. This readiness contract has not yet been integrated into generated games, so selected-template verification may report unavailable/fail rather than a false pass. Arbitrarily deferred JavaScript fetches cannot be distinguished from scenario-lazy loads without an application readiness contract.
- GT-8 readiness integration: selected-template context now carries one host-authored readiness policy shared by planner and workers; runtime guidance reminds the orchestrator without coupling templates to task count. Browser readiness remains receipt-gated and fails closed on timeout. Only newly accepted fresh selected-template plans with a validated mandatory receipt receive the host-owned readiness-policy marker in `.numa/plan.json`; historical plans with receipts but no marker and subsequent updates of those plans bypass the new eager check. New fresh plans retain the marker across updates until a later accepted plan overwrites it. Pure parser checks cover historical and marked receipts, invalid markers, and unknown keys. Live Trigger/Daytona execution remains unverified; independent GT-8 source review returned PASS.
- Work-unit commit: not created (user instructed not to commit).

### GT-9 — Make the build turn conversational — completed (uncommitted)

**Route**
- Delegated implementation after mapping AI SDK multi-step text/tool rendering.

**Outcome**
- The orchestrator speaks briefly in the player's language before planning, after the plan, before delegated building, before review, and when blocked or complete.
- Narration is model-authored, visible in the assistant turn, and grounded in actual next actions; host phase labels remain a fallback rather than a substitute.
- Updates remain concise and do not expose chain-of-thought or fabricate completed work.

**Checks**
- Tool-loop transcript fixtures prove text appears before and between tool phases.
- No narration is stored as synthetic user content.
- Failure/unavailable paths narrate the block instead of celebrating success.

**Evidence**
- HARNESS_PHASES-only routing guidance requests brief model-authored user-language text ahead of planning, delegation, and verification, plus truthful terminal replies and direct-tweak acknowledgement. AI SDK v7 can emit assistant text alongside tool calls; a text-only step terminates the loop, so no such step or synthetic chat text was introduced.
- Model compliance and same-step ordering are best-effort, not guaranteed narration. Deterministic host progress remains the guaranteed fallback, and GT-8 truthfulness gates take priority.
- A pure typed AI SDK UI transcript fixture checks `text → tool → text → tool` grouping and text-before-following-tool rendering without synthetic user content.
- Corrected the routing wording: interim progress describes the next action, while the final completion reply waits until verification has run. Source-level PASS after correction: `pnpm --filter web typecheck`, `pnpm --filter web exec eslint lib/games/instructions/workflow.ts lib/games/tool-parts.test.ts`, `pnpm --filter web exec tsx --test lib/games/tool-parts.test.ts` (one fixture), and `git diff --check` passed. Live Trigger/Daytona model narration remains untested; model compliance is best-effort, not guaranteed.
- Work-unit commit: not created (user instructed not to commit).

### GT-10 — Expand Cube World to the complete glTF pack — completed (uncommitted)

**Route**
- Delegated asset/schema implementation with generated manifest validation.

**Outcome**
- `cube-world@1` includes all 107 glTF runtime assets from Animals, Blocks, Characters, Enemies, Environment, Pixel Blocks, and Tools.
- Blend, FBX, OBJ, MTL, previews, and duplicate source representations remain excluded.
- Every glTF keeps embedded buffers/textures, exact casing, semantic category, and exact animation declarations where present.
- Planner context provides a grouped searchable inventory while generated games eagerly load only the subset needed for their design.
- Missing-license risk metadata remains explicit and never becomes a license claim.

**Checks**
- Exact source/destination parity for all 107 glTF files and no forbidden formats.
- Complete glTF/embedded-resource/animation/category validation and serialized byte totals.
- Real Cube preflight, Fantasy/no-template isolation, Trigger inclusion, and strict schema negatives.

**Evidence**
- Independently recounted the read-only source before copying: 107 glTF files, 13,012,770 serialized bytes; Animals 9, Blocks 15, Characters 4, Enemies 9, Environment 36, Pixel Blocks 18, Tools 16; 22 animated; `Block_Blank.gltf` has two source-category instances.
- Retained five root paths and manifest ids; copied 102 other files under category directories. Standalone Python3 source/destination validator passed SHA-256 parity for all 107, exact animation-name sets for all 22 animated models, self-contained buffer/image URI scan for all 107, unique manifest ids/paths, expected category counts and total bytes, and no non-glTF files in the asset tree.
- Extended bounded model categories without changing the existing animation categories or immutable template, vendor provenance, license-risk, and browser contract metadata. Descriptor now documents the full pack, a maximum-six eager subset, lazy optional loading, and the five-model example.
- `pnpm --filter web typecheck`, `pnpm --filter web exec eslint lib/games/templates/seed.ts`, and `git diff --check` passed. Real `pnpm --filter web exec tsx -e ...` preflight passed: Cube 107 models/146 seed files, Fantasy 109 seed files, none 35 seed files; no cross-template asset leakage. Node emitted a non-blocking `module.register()` deprecation warning.
- Planner context now renders the complete model inventory in deterministic semantic-category groups with counts, preserving exact manifest ids, case-sensitive paths, and declared animation names/categories. Pure manifest-backed tests passed for all 107 Cube and 34 Fantasy entries, unique rendered lines, headings/totals, stable order, and under-40k-character output. Web typecheck, focused ESLint on the context/helper/test files, focused `tsx --test`, and `git diff --check` passed; Node emitted a non-blocking `module.register()` deprecation warning.
- Independent GT-10 source verification returned PASS: 107 source/seed/manifest glTF files totaling 13,012,770 bytes, SHA-256 parity 107/107, declared clips 22/22, and category counts Animals 9 / Blocks 15 / Characters 4 / Enemies 9 / Environment 36 / Pixel Blocks 18 / Tools 16. Both inventory tests passed (2/2); Cube and Fantasy preflights and no-template isolation, web typecheck, focused lint, and `git diff --check` passed. The first validator failure came from its erroneous `Pixel Blocks` → `Pixel-Blocks` assumption; after correcting that assumption, the second validator passed.
- GT-10 source implementation is completed but uncommitted, not delivered. Live Daytona/Chromium execution was NOT run; the global end-to-end gate remains pending. Cube World has no bundled license evidence: exposure risk was accepted, but this is not a redistribution grant. No database command was run.
- Work-unit commit: not created (user instructed not to commit).

### GT-11 — Live template regression — blocked (uncommitted)

**Route**
- Exactly three potentially billable game/sandbox creations were explicitly authorized, with model, Trigger, Daytona, and Chromium verification; this was not a snapshot build.

**Live evidence**
- No template: game `704f8029-9a88-4a8e-b4e1-1226b1aef352`, sandbox `38cd3f77-c3ae-4b6d-b559-9b310823a1c8`, `none@1`. Durable browser verification PASS, no deterministic findings; visual verifier PASS.
- Fantasy Cards: game `347781fe-01d3-4029-91a8-c3979a5ecf4a`, sandbox `847b7bf9-1b8f-4de9-bf05-c88a287becde`, `fantasy-cards@1`. All 34 glTF assets seeded; four declared eager. Durable initial verification FAIL twice on action-click timeouts. One independent bounded Chromium rerun after browser-harness correction found no new console errors or template failures: PASS as a stand-alone recheck only; the original durable FAIL remains.
- Cube World: game `3c9fc33d-a9a2-4252-abf0-0eea75646207`, sandbox `e48e285d-6761-476d-8198-47bc7d6f6b5c`, `cube-world@1`. All 107 glTF assets seeded; five declared eager. Durable initial verification UNAVAILABLE twice after 30-second page loads. A corrected independent browser recheck reached the page and scenarios but FAILed on `engage`/`attack` click timeouts; no new console errors. Desktop screenshot `/tmp/numa-live-cube-screenshot.jpg` is visibly obscured by a nearby tree, so gameplay visual quality is poor.
- Model-authored Spanish progress was observed and persisted, but narration at every stage is not guaranteed.

**Harness correction and checks**
- Browser harness changes in `apps/web/lib/daytona/verify-script.ts` and `apps/web/lib/daytona/verify.ts`: commit navigation for enrolled templates, touch readiness, `no_wait_after` for real clicks, six-second selectors/clicks, desktop screenshot followed by desktop-page close before touch, and a bounded 120-second process.
- Local web typecheck, focused lint, Python syntax compilation, and diff check passed. Independent source review PASS, with a warning that the overall timeout excludes setup.
- These corrections do not retroactively convert durable Fantasy or Cube results to PASS. Reliable real clicks and Cube gameplay visual quality remain unresolved. All source is uncommitted; no push, PR, or snapshot build occurred.

## Acceptance criteria

- The home composer offers an explicit template picker whose default is `No template`.
- The server validates the selection and stores a stable template id/version.
- The template cannot be changed from an existing game's composer.
- A Fantasy Cards game starts with its declared assets locally available and receives template-specific guidance.
- A no-template game does not receive Fantasy Cards assets or instructions.
- Cube World is selectable with explicit risk metadata and without a false bundled-license claim.
- Selected templates fail closed when their descriptor, manifest, loader, or required assets are missing.
- Full-game planning produces reviewable behavioral work units and template-aware receipts.
- Verification covers stateful interaction and asset failures where the runtime harness permits it.
- Players receive concise, deterministic progress plus brief model-authored conversational narration before and during long-running work.
- Planning and delegation follow complexity/cohesion rather than template presence.
- Failed or unavailable verification cannot be presented as verified success.
- Cube World exposes all 107 glTF assets while excluding duplicate source formats.
- All completed checks and all skipped/pending checks are recorded truthfully.

## Progress

- Architecture and local asset compatibility were explored.
- Explicit immutable selection was accepted by the user.
- Feature branch `feat/game-templates` created.
- GT-1 implementation and independent verification completed without a commit.
- Database application was deferred to GT-3 until explicit authorization was obtained.
- GT-2 provisioning and independent verification completed after one manifest-schema correction.
- GT-3 integrated source verification completed without a source/schema/provisioning mismatch.
- Database package lint is unavailable due to its pre-existing missing ESLint 9 flat config.
- The additive database schema was applied successfully with explicit user authorization.
- At GT-3, runtime/browser creation and Daytona upload were a documented verification gap because no configured authenticated harness was available; GT-11 later exercised the live path.
- The latest Fantasy Cards generation was forensically inspected after the user reported poor quality.
- Root causes were confirmed across template deployment, planning scope, worker behavior, and screenshot-only verification; model capability was not the primary failure.
- The user accepted exposing Cube World despite missing local license evidence and current redistribution risk.
- GT-4 completed and independently passed after strict manifest parsing and executable preflight corrections.
- GT-5 completed after one correction round and final independent PASS; the browser contract is source-verified but not yet live-runtime exercised.
- GT-6 completed after lifecycle corrections and final independent PASS; live Trigger/browser behavior remains a documented runtime gap.
- GT-7 completed with source-level independent PASS and explicit WARNs for missing license evidence and unexecuted live browser runtime.
- The no-template incident confirmed the old one-task default still produced a 73 KB monolith because decomposition was incorrectly tied to template-first-build enforcement.
- The Fantasy Cards incident confirmed four-task decomposition was better, but both verification attempts were unavailable, fourteen exploratory calls followed, and the final response still claimed success.
- The user clarified the target behavior: adaptive complexity-based delegation for every game, concise conversational narration during work, and the complete 107-glTF Cube World pack.
- GT-8 has independent source PASS; GT-9 source and fixture checks passed; GT-10 source implementation and independent source verification passed. Their historical source evidence remains intact.
- GT-11 exercised three explicitly authorized live creations through model/Trigger/Daytona/Chromium, not snapshot builds. No-template passed durable and visual checks; Fantasy durable verification failed despite a passing independent stand-alone recheck; Cube durable verification was unavailable and the independent recheck failed real clicks, with poor gameplay visibility in its screenshot. The end-to-end gate remains blocked, not 3/3 PASS. Source remains uncommitted and undelivered on `feat/game-templates`; no push or PR occurred.

## Recovery checkpoint — 2026-10-13

- User authorized saving the existing local work separately from the subsequent Argon model upgrade.
- Read-only inspection covered 220 old-work files (25 tracked changes and 195 untracked), excluding `odd/tasks/argon-tier-profiles.md`.
- No accidental environment/key/log/scratch/symlink files and no secret-pattern candidates were detected in 40 non-vendor, non-glTF text files. This heuristic scan is not a proof of absence.
- Fresh source checks: web and `@workspace/db` typechecks PASS; inventory/tool-parts tests 3/3 PASS; focused ESLint over 33 changed web files has 0 errors and the known `DAYTONA_GAME_SNAPSHOT` Turbo environment warning; actual generated Python (10,892 bytes) compiles in memory; `git diff --check` PASS.
- DB lint remains unavailable due to the pre-existing missing flat config. No new database push, live model call, Daytona game creation, or browser execution occurred.
- GT-11 remains blocked, including Fantasy's durable FAIL and Cube's unavailable verification, later real-click failures, and poor visibility. The accepted Cube license risk is unchanged.
- This is preservation of previously implemented source, not new behavior development: there is no meaningful retroactive RED; the source checks above verify the checkpoint without inventing TDD evidence.
- Checkpoint commit identity will be recorded after creation; historical uncommitted notes above describe the original September execution.

## Next step

Resolve Cube World gameplay visibility and reliable real-click verification, then repeat bounded live verification without treating independent rechecks as replacements for failed or unavailable durable results. Keep GT-11 blocked and retain the Cube World license-risk warning; do not mark the feature complete.
