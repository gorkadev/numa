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

### 1. Add route and shell loading resilience — implementation verified, awaiting commit authorization

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
- Commit: pending explicit authorization.

### 2. Guard subscription changes with confirmation and pending states — pending

**Outcome**
- Pro→Max and Max→Pro require distinct confirmation dialogs.
- Dialog copy explains immediate charge versus next-cycle downgrade.
- Submission is single-flight and visibly pending through redirect.
- Post-change billing reconciliation is explicit.

**Checks**
- Component/action tests where available.
- Focused typecheck/lint.
- Runtime confirmation, cancel, success, and failure paths.

**Evidence**
- Commit: pending explicit authorization.

### 3. Add preview startup, timeout, failure, and retry states — pending

**Outcome**
- Preview and play views distinguish startup, slow startup, ready, timeout, and retry.
- Reload cannot be spammed while a frame is starting.
- Failure does not masquerade as a successful iframe load.

**Evidence**
- Commit: pending explicit authorization.

### 4. Add authentication and account-transition feedback — pending

**Outcome**
- OAuth redirects, passkey entry, account loading/switching, and sign-out have scoped pending and error states.
- Account lists do not pop into an apparently complete menu.

**Evidence**
- Commit: pending explicit authorization.

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
