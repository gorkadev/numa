# Loading State Improvements

## Goal

Make every meaningful wait, navigation, mutation, and long-running state in Numa explicit, recoverable, and proportionate without replacing usable stale content unnecessarily.

## Delivery strategy

Phased delivery, selected by the user. Keep each phase reviewable and independently verifiable.

## Constraints

- Subscription changes require an explicit confirmation dialog before submission.
- Preserve server-side authorization and billing enforcement.
- Follow the installed Next.js 16.2.6 documentation for loading and error boundaries.
- Do not create database migrations.
- Do not commit, push, or open a PR without explicit user authorization.

## Tasks

### 1. Add route and shell loading resilience — completed

**Outcome**
- Authenticated navigation has meaningful loading UI.
- Game, play, and pricing routes preserve final-layout geometry while loading.
- Route failures expose a retry action.
- The authenticated layout remains synchronous at its public boundary; authorization, billing provisioning, and persisted sidebar state resolve before route interaction, while game-list latency is isolated to the sidebar.

**Checks**
- Passed focused ESLint for all six affected source files.
- Passed `pnpm --filter web typecheck`.
- Passed `git diff --check` and `git diff --cached --check`.
- Used focused lint plus full web typecheck as the narrower substitute for a production build.
- Runtime throttled-navigation and forced-error checks remain pending because no browser harness was run.

**Evidence**
- Independent verification: PASS after two correction rounds restored sidebar cookie state, billing ordering, and strong session validation.
- Commit: `dd795e1` (`feat(web): add route loading resilience`).

### 2. Guard subscription changes with confirmation and pending states — completed

**Outcome**
- Pro→Max and Max→Pro require distinct confirmation dialogs.
- Dialog copy explains the approximate immediate prorated charge versus a next-cycle downgrade with no immediate charge or refund.
- Submission is single-flight, locks dialog dismissal and actions, and remains visibly pending through redirect.
- Existing redirect-driven success/error feedback, server refresh, and eventual sidebar reconciliation remain intact.

**Checks**
- No existing component/action test framework or nearby tests were available to extend without adding out-of-scope infrastructure.
- Passed focused ESLint for the pricing page and plan-change dialog.
- Passed `pnpm --filter web typecheck`.
- Passed `git diff --check`.
- Runtime confirmation, cancel, success, and failure paths remain pending because no browser harness was run.

**Evidence**
- Independent verification: PASS with no blockers.
- Commit: `0c03b79` (`feat(web): confirm subscription changes`).

### 3. Add preview startup, timeout, failure, and retry states — completed

**Outcome**
- Preview and play views distinguish startup, slow startup, ready, timeout, failure, and retry.
- Reload cannot be spammed while a frame is starting or slow.
- Authenticated HEAD preflight plus an attempt-bound readiness bridge prevents iframe load failures from masquerading as success.
- Timers, probes, listeners, and stale attempts are cleaned up across retry, revision changes, and unmount.

**Checks**
- Passed focused ESLint and Prettier checks for all four affected files.
- Passed `pnpm --filter web typecheck` and `git diff --check`.
- Independent security-sensitive verification confirmed token confinement, response-header rewriting, bridge validation, cleanup, and both toolbar integrations.
- Browser-level lifecycle timing and forced-failure paths remain pending because no automated browser harness was run.

**Evidence**
- Independent verification: PASS with no blockers.
- Commit: `86f37a7` (`feat(web): harden preview startup states`).

### 4. Add authentication and account-transition feedback — completed

**Outcome**
- OAuth redirects, passkey entry, account loading/switching, and sign-out have scoped single-flight pending and error states.
- Account lists explicitly distinguish loading, loaded, and failed/retry states instead of appearing complete early.
- Returned and thrown Better Auth failures restore controls; successful navigation keeps them locked through unload.

**Checks**
- Passed focused ESLint with one pre-existing React Hooks warning in `auth-page.tsx`.
- Passed full web typecheck, Prettier, and `git diff --check`.
- Independent high-risk verification passed after correcting synchronous navigation-exception cleanup.
- Browser-level OAuth, passkey, switching, and sign-out paths remain pending because no automated UI harness exists.

**Evidence**
- Independent verification: PASS after one correction round.
- Commit: pending authorized commit.

### 5. Harden settings loading and mutation recovery — pending

**Outcome**
- Profile, passkeys, sessions, and security use stable skeletons for first load.
- Fetch and mutation failures are visible and retryable.
- Pending cleanup is guaranteed.

**Evidence**
- Commit: pending explicit authorization.

### 6. Clarify chat reconnection and shared feedback primitives — pending

**Outcome**
- Chat distinguishes reconnecting from a newly submitted turn.
- Shared skeleton/spinner primitives support reduced motion and contextual labels.
- Existing task progress and stop behavior remain intact.

**Evidence**
- Commit: pending explicit authorization.
