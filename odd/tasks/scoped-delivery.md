# Scoped delivery

## Authorization
User requested all pending work committed by coherent scope and pushed to feat/agentbot-avatars. Explicitly retain creation avatar84px, travel10, alain00; stale regression tests aligned without changing component. No PR/merge/force-push authorized.

## Tasks
- [x] D1 Align accepted avatar tests and authorization docs. RED2pass/2fail then GREEN4/4, focused ESLint/whitespace pass. Evidence included in f7d706a.
- [x] D2 Independently verify and commit scoped work. Four functional commits created below.
- [x] D3 Publish functional commits — done. Ordinary upstream-creating push succeeded; remote matched local f7d706a6cfe017cff0013847c94ec7ca75e15063. Only this delivery evidence remains to commit/push.

## Commit evidence and rollback units
- d8a3b49 feat(chat): add specialist avatars and localized run metadata — helpers/tests, shared specialist UI, actual served effort records, translations, dependencies/root CSS, relevant task docs. Shared UI kept coherent rather than artificial hunk splitting.
- 0d131da feat(composer): distinguish tier and template picker icons — only model/template picker presentation.
- f3c53b4 fix(preview): configure play link as a non-native button — only full-screen preview anchor configuration.
- f7d706a feat(web): add cursor-tracking avatar to game creation — header page/component/tests/task doc. Depends on Blobatar dependencies above.
- Follow-up docs commit records these identities. Each rollback boundary is its named behavior and accompanying tests/docs, respecting creation avatar dependency.

## Verification and limitations
Independent combined test suite12/12 passes after accepted test alignment; typecheck, focused ESLint and diff whitespace checks pass. Initial combined10/12 failed solely stale expectations; resolved. No source/index mutations by verifier; no secret signatures or forbidden migration files found. Expected ignored incremental tsbuildinfo output allowed. RDD off; ASSESS unassessable due untracked declaration, independent-verifier fallback fulfilled. Browser appearance/pointer/reduced-motion/hydration not observed (sign-in redirect, no runtime). Production build and live fallback integration not run.

## Delivery
Current branch feat/agentbot-avatars; remote origin https://github.com/gorkadev/numa.git. Remote branch created by successful ordinary push; tracking upstream configured and functional HEAD verified remotely. No force push, PR or merge. Functional commits total497 additions/32 deletions including docs/dependency lockfile; no oversized PR created.

## Next step
Commit and push this delivery evidence, then confirm remote final HEAD and clean tree. Final documentation commit identity and push result will be recorded in session memory to avoid an endless post-push documentation commit loop.
