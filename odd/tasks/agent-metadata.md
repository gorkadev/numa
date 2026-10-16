# Localized agent metadata

## Objective and accepted scope
Localize role-keyed names/specialties in inline chat, sidebar and detail; do not mutate persisted IDs/displayName. Spanish: Explorador / Análisis del proyecto; Arquitecto / Planificación; Constructor / Mecánicas de juego; Artista / Diseño visual; Compositor / Audio y música; Verificador / Pruebas y validación. English names Scout, Architect, Builder, Artist, Composer, Tester remain recognizable.
Remove raw tier/slot badges, hide internal slot and show labeled tier, model and reasoning effort. Optional structured effort comes from actual served entry including fallback; provider options/dispatch unchanged. Historical known terminal suffixes parsed conservatively; unknown effort displays No disponible/Unavailable. Preserve AgentBot and composer changes. No DB/dependency changes. User has now explicitly authorized scoped commits and push; delivery remains parent-owned.

## Tasks
- [x] T1 Implement metadata and localization with focused tests. Delegated writer mv8tsq5s-a-dhge completed.
- [x] T2 Independently verify compatibility/translations and record limitations. Verifier mv99pdhh-c-k8kn PASS; original verifier failed without results and was replaced after user requested continuation.
- [ ] T3 Manual authenticated browser validation. Pending: browser automation unavailable.

## Verification evidence
Historical implementation checks; current delivery validation and commit/push evidence remain pending the parent.
- Presentation RED observed before helper existed; GREEN 3/3, parent rerun 3/3.
- Records compatibility tests 2/2 (added after implementation; no independent RED claimed).
- Independent combined node --test apps/web/components/chat/agent-run-presentation.test.ts apps/web/lib/games/harness/records.test.ts apps/web/components/chat/agent-bot.test.ts: 8 passed, no failures/skips.
- pnpm --filter web typecheck: PASS (initial writer typing issues corrected).
- Scoped ESLint on subagent-entry/panel/run-detail, agent-run-presentation/test, model-registry, records/test and run-subagent: PASS.
- git diff --check: PASS.
- Independent source inspection: locale key parity, historical schema compatibility, structured effort precedence, actual served entry stamping, provider/dispatch unchanged, prior AgentBot/composer preserved. No concrete defects found.
- Parent inspected helper and schema/registry/producer diff.
- Not run: browser/visual checks, production build, runtime fallback integration test. Fallback stamping verified structurally, not through a runtime integration scenario.

## Delivery and next step
Branch feat/agentbot-avatars. ask-on-risk; forecast 200-350 lines, approximately 160 authored for this unit excluding prior changes. Scoped commits and push explicitly requested by the user; execution and evidence pending the parent. RDD off; ASSESS unassessable due to untracked files, treated high and independently verified. No authority maintenance.
Next: parent completes authorized scoped commits/push and records evidence. Manual visual check (T3) remains pending; production build/runtime integration checks remain unverified.
