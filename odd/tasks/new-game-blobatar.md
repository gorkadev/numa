# New-game brand Blobatar

## Objective and scope
Replace only the home/new-game header logo with a stable 84px Blobatar in exact logo blue (#2563eb), using official pointer gaze. Preserve server rendering, localization, composer, sidebar/chat branding and all unrelated staged/dirty changes. No new dependencies or custom pointer engine. Decorative/non-focusable.

## Tasks
- [x] T1 Implement avatar and regression tests — done, delegated gentle-ai-worker (multi-file trigger).
- [x] T2 Independent verification — done; verifier settled, checks passed with browser limitations below.

## Implementation and checks
Historical checks below describe the original implementation, not current delivery validation.
- Files: apps/web/app/[locale]/(app)/page.tsx; apps/web/components/new-game-avatar.tsx; apps/web/components/new-game-avatar.test.ts.
- Current user-accepted settings: stable name alain00; size 84px; palette.head #2563eb; useGaze({ travel: 10, lookAt: "pointer" }); animate always; upstream motion/gaze CSS.
- RED observed missing new component, existing three tests passed; GREEN 7/7.
- Both writer and independent verifier: focused Node tests 7/7, scoped ESLint exit 0, web typecheck exit 0, tracked diff check exit 0. Untracked no-index whitespace check had no diagnostics (exit 1 reflects additions).
- Parent spot read confirmed component and tests. Independent review found no source correctness defect; global gaze CSS identity defaults preserve existing AgentBot behavior.
- Browser verification attempted but blocked: localhost redirects 307 to /sign-in; no browser/Playwright binary; CDP9222 refused; Orca runtime unavailable. Screenshot, actual pointer motion, runtime reduced motion and hydration NOT observed.
- No installations, accounts, composer submissions, staging, or commits. Expected ignored tsconfig.tsbuildinfo output permitted for typecheck.
- Scoped source count: 74 additions, 2 deletions. Forecast ~100–180 authored lines; delivery strategy ask-on-risk.
- RDD off by clone override previously observed; ASSESS unassessable due untracked declaration; required fallback independent verifier used, no native review started.
- Local Next use-client guide and upstream Blobatar README reviewed. Main body palette key is head. Official hook owns fine-pointer/reduced-motion guards.

## Delivery and next step
Branch feat/agentbot-avatars. User explicitly authorized scoped commits and push and selected retaining the current 84px/travel10/alain00 appearance. Stale regression expectations are being aligned without changing the component. Current delivery validation and commit/push evidence are pending the parent; no commit hashes are recorded here. Next: parent completes scoped delivery and records evidence; manually check the authenticated creation view for appearance, cursor tracking, and reduced-motion behavior. Browser checks remain unverified.
