# Optional auth usernames

Objective: Add Better Auth's username field without changing login UI or assigning usernames automatically. Future login onboarding will let users choose one; that future UI is out of scope.

Problem/why: Current Google/GitHub and passkey users have no username or credential password. Existing and newly created users must continue signing in unchanged while the schema becomes ready for a later onboarding flow.

Scope: Better Auth server plugin and matching Drizzle user schema only. No password login setup, UI, automatic username generation, or migration files. PostgreSQL permits multiple NULL values in a unique username column.

Constraints: `packages/db/src/schema.ts` is the source of truth; use `pnpm db:push`, never generate/migrate/ad hoc DDL. Read db:push prompts before accepting a potentially destructive change. Keep `nextCookies()` last in the plugin array. Technical artifacts in English.

TDD: off (project `openspec/config.yaml` says `strict_tdd: false`, `tdd: false`; no app test runner identified). Focused checks: `pnpm --filter @workspace/db typecheck`, `pnpm --filter web typecheck` (verify actual package names first). Runtime harness: inspect plugin schema and DB push result, or N/A if live database access cannot safely be used.

Delivery: ask-on-risk; forecast <100 authored changed lines, one work-unit commit; no PR/push without a separate request. Branch: `feat/new-flow` (non-default). RDD: off at session start.

## Tasks

- [x] AUTH-1 Add nullable, unique username to the Drizzle user table and register Better Auth's username plugin without displayUsername; preserve OAuth/passkey login and avoid UI/password changes. Route: delegated `gentle-ai-worker` (2 nontrivial files; multi-file write trigger). Work-unit commit: `06959cd0d33c087be958e9d1924fdced23cd277f`.

## Acceptance

- Existing and new social accounts may have NULL username; unique non-NULL usernames are enforced.
- Better Auth's user schema matches Drizzle and does not demand a username at social signup.
- No login UI, password credential setup, or generated migrations are introduced.
- Checks and any DB push outcome recorded; no task checked off if checks fail or are blocked.

Progress: AUTH-1 completed. Writer and independent verifier both passed `pnpm --filter @workspace/db typecheck`, `pnpm --filter web typecheck`, and `git diff --check`; parent repeated web typecheck and diff check. `pnpm db:push` initially stopped before applying changes because Drizzle required a TTY to answer its question about truncating the two-row `user` table. Retried in a PTY and explicitly chose **No, add the constraint without truncating the table**; Drizzle exited 0 with `Changes applied`. No table truncation was selected. Runtime OAuth/passkey sign-in was not exercised. Native read-only risk assessment returned `unassessable` because the feature document was untracked, so the independent verifier was run under the high-risk fallback. Rollback boundary: code files `apps/web/lib/auth.ts` and `packages/db/src/schema.ts`; the database schema change has been applied and needs its own schema-based reversal if rollback is requested. Next: future login onboarding to let users choose usernames, only when separately authorized.
