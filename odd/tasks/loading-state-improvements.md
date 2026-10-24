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
- Commit: `4eeb2b1` (`feat(web): clarify auth transition states`).

### 5. Harden settings loading and mutation recovery — completed

**Outcome**
- Profile, passkeys, sessions, and security use stable skeletons for first load.
- Fetch failures are explicit and retryable without stale results overwriting newer requests.
- Returned and thrown mutation failures are visible; pending cleanup is guarded across unmount and superseded attempts.
- Security-sensitive 2FA verification and recovery-code flows block unsafe dismissal and ignore obsolete completions.

**Checks**
- Passed focused ESLint, full web typecheck, Prettier, and diff checks across all six files.
- Independent high-risk verification passed after three correction rounds covering dialog races, unmount safety, and truthful refresh feedback.
- Browser-level failure injection remains pending because no automated component/browser harness exists.

**Evidence**
- Independent verification: PASS.
- General settings commit: `3d6c6df` (`feat(web): recover settings data states`).
- Security/2FA commit: `d52978a` (`fix(web): harden two-factor transitions`).

### 6. Clarify chat reconnection and shared feedback primitives — completed

**Outcome**
- Chat distinguishes the initial stream reconnection from a newly submitted turn across both thinking render paths.
- Reconnection attempts are guarded across game changes, stale resolutions, and React Strict Mode.
- Shared skeleton/spinner primitives respect reduced motion; Spinner supports contextual labels while preserving its announced default and an explicit decorative mode.
- Existing task progress, pending, and stop behavior remain intact.

**Checks**
- Passed focused web/UI ESLint, both package typechecks, Prettier, and cached/unstaged diff checks.
- Independent verification passed after restoring Spinner accessibility backward compatibility.
- Browser-level reconnection and screen-reader checks remain pending because no automated browser harness exists.

**Evidence**
- Independent verification: PASS after one correction round.
- Commit: this work unit (`feat(web): clarify chat reconnection feedback`).

### 7. Size the route skeletons to the measured UI — done, pending commit

**Problem**

Task 1 promised that "game, play, and pricing routes preserve final-layout geometry while loading" and recorded the browser check as pending because no harness existed. That check was never run, so the promise was never verified. Measuring the fallbacks against the loaded pages shows they approximate rather than match the real layout:

- `/pricing` at 1280 renders 1122px of document against a real 1319px — a 197px shift on navigation.
- The plan card skeleton is ~328px tall against a 375.8px `Card`, uses an 18px radius against the card's 24px, `p-6` against the card's 20px spacing, a 36px button against the real 32px, and a 116px accordion block against a 386px accordion.
- `/games/[id]` draws the composer as a 48px bordered row with a button underneath; the real composer is a single 736x112 filled `InputGroup` with a 64px control and a 46px addon row.
- `/profile` renders the home fallback because it has no `loading.tsx` of its own, so the page jumps from a centered hero into a settings layout.

**Method (reproducible)**

- Playwright 1.51 driving `next dev` on port 3005 with a real Better Auth session: a throwaway `session` row attached to the existing user that owns the 14 seeded games, deleted when the audit ends. No content was written.
- Loaded UI measured at 375, 768 and 1280 on real data (`58bd7bd3-…`, 14 messages).
- Fallback measured by delaying the RSC payload of a client-side navigation, the only moment Next renders `loading.tsx`.

**Measured — loaded UI**

| Route | Element | Geometry |
| --- | --- | --- |
| home | `Empty` | 1024 x 516.2, `p-12`, radius 22 |
| home | `EmptyMedia` avatar | 84 x 84, `mb-2` |
| home | title line | 28 (`text-lg`) |
| home | description | 3 x 22.75 = 68.2 |
| home | composer `InputGroup` | 768 x 112, radius 18; control 64; addon 46 |
| home | suggestion chips | 2 rows x 28, gap 8 |
| pricing | `Empty` header | 976 x 177.5 |
| pricing | plan `Card` | 314.7 x 375.8, radius 24, spacing 20 |
| pricing | `CardHeader` | 96 = badge 20 + title 24 + description 2 x 20 + gaps 6 |
| pricing | button | 32 |
| pricing | feature `Item` (`xs`) | 37.2; 56.5 when two lines |
| pricing | top-up `Card` | 314.7 x 168 |
| pricing | accordion | 976 x 386 = 7 rows x 55 |
| game-detail | header | 56 (`h-14`), `px-4`, actions 28 x 28 |
| game-detail | message column | 736, `px-5` -> rows 696 |
| game-detail | bubble | max 80% = 556.8, radius 22, padding 10/12 |
| game-detail | composer | 736 x 112, radius 18; control 64; addon 46; send 32 |
| game-play | top bar actions | 32 x 32, inset 16 |
| profile | avatar | 80 x 80 |
| profile | name line | 32 (`text-2xl`) |
| profile | stats strip | 704 wide, 4 columns |
| profile | detail cards | 346 x 218, radius 24 |

**Measured — fallback before**

| Route | 1280 | 375 |
| --- | --- | --- |
| home | 6 blocks; avatar 48 vs 84; card 686 x 96 vs 768 x 112; description 2 lines vs 3 | same block errors |
| pricing | 1122 vs 1319; card ~328 vs 375.8; radius 18 vs 24; button 36 vs 32; accordion 116 vs 386 | 2522 vs 2492 with the same internal errors |
| game-detail | composer 966 x 48 + 36 vs 736 x 112; actions 32 vs 28 | same |
| game-play | actions 40 vs 32; inset 12 vs 16 | same |

**Decisions**

1. Build each fallback from the primitives the page itself uses — `Empty`, `EmptyHeader`, `EmptyContent`, `Card`, `CardHeader`, `CardContent`, `Item`, `ItemGroup`, `ItemContent`, `ItemMedia`. Radius, padding, gap, max-width and grid breakpoints then come from the component instead of a copied pixel value, which is what stops this drifting again. All of them are server-safe; the pricing page already renders `Card` and `Item` from a Server Component.
2. Leave `packages/ui/src/components/skeleton.tsx` untouched. The audit is about sizes, not about restyling the primitive.
3. Size text placeholders to the measured line box (20 for `text-sm`, 28 for `text-lg`, 32 for `text-2xl`), never to an arbitrary `h-4`.
4. Add `app/[locale]/(app)/profile/loading.tsx`, because the route currently borrows a layout that belongs to a different page.
5. Do not model the preview pane in the game fallback: whether a preview exists is not known while loading.
6. State coverage measured: viewports 375/768/1280; sidebar expanded — collapsing only changes the available width and every fallback is fluid; plan state on Max, where the Pro card gains one 20px line. The fallback targets the Free/Pro height, so Max is 20px off; modelling a plan the fallback cannot know would be worse.

**Subtasks**

- [x] 7.1 Home fallback (`(app)/loading.tsx`) mirrors the home `Empty` hero: 84px media, one 28px title line, three 20px description lines, a 112px composer surface and two rows of 28px chips.
- [x] 7.2 Pricing fallback mirrors the page: `Empty` header, three `Card`s with 96px headers, 32px buttons and three `Item` feature rows, the top-up header pair, three 168px top-up cards, and a seven-row accordion shell.
- [x] 7.3 Game fallback mirrors the chat shell: 56px header with 28px actions, a 736px message column with 22px-radius bubbles, and the 112px two-row composer.
- [x] 7.4 Play fallback uses the measured 32px actions and 16px inset.
- [x] 7.5 New profile fallback: page header, 80px avatar, name/email/handle stack, four-column stats strip, activity heading with its segmented control, and two 346x218 cards.

7. Do not adopt `boneyard` as a runtime dependency. It measures `<Skeleton name loading>` from its own React package, which requires wrapping the loaded content, a build-time capture step producing `.bones.json`, and a runtime `registerBones` registry. These fallbacks are App Router `loading.tsx` Suspense fallbacks: the loaded page is never mounted alongside them, so boneyard cannot observe it from inside `loading.tsx`. Its idea — size the placeholder from the real DOM — is adopted here with a one-off Playwright harness instead.

**Acceptance criteria**

- Every fallback's scroll height is within 1% of the loaded page's scroll height for routes that scroll, except the documented plan-state delta (decision 6).
- Every container radius and padding comes from a real primitive, not from a hardcoded pixel value.
- No interactive element, focusable control or client component is introduced into a fallback.
- `pnpm --filter web typecheck`, focused ESLint and Prettier pass.

**Results — measured after**

| Route | Viewport | Real | Fallback | Delta |
| --- | --- | --- | --- | --- |
| pricing | 375 | 2492 | 2490 | -2 (-0.1%) |
| pricing | 768 | 1617 | 1624 | +7 (+0.4%) |
| pricing | 1280 | 1319 | 1302 | -17 (-1.3%) |
| profile | 375 | 1078 | 1084 | +6 (+0.6%) |
| profile | 1280 | 900 | 900 | 0 |
| home | 375 | 704 | 704 | 0 |
| home | 768 | 588 | 588 | 0 |
| home | 1280 | 516 | 516 | 0 |

Home and game-detail are `h-svh`, so the document height hides internal error; those two were compared block by block instead. Home `Empty` matches exactly at all three widths. Game-detail reproduces the 56px header, the 736px column, the 696px content row behind the 32px assistant avatar, and the 556.8px bubble cap at 1280 (556.8 measured, 80% of 696).

The 1280 pricing delta is entirely decision 6: the reference account is on Max, whose Pro card carries one extra 20px `CardContent` line. On a Free account the same fallback would land within 5px.

**Review follow-up.** The 768 finding below was fixed at the source rather than encoded in the fallback: `pricing/page.tsx` now uses `lg:grid-cols-3` for the plan and top-up grids, and the fallback lost its `md:`/`lg:` line-count variants and the FAQ `index === 5` special case. Game-detail bubble skeletons gained `max-w-full` so they cannot overflow the 80% bubble cap at 375, and the 364-cell profile heatmap became one 622x82 block. The 768 and 375 pricing rows below predate this and must be re-measured.

The 768 pricing number is the interesting one. At that width the real page keeps `md:grid-cols-3` inside a 512px inset, so each plan card is 144px wide and its copy wraps four to six times, producing a 613.8px card and a 1617px document. No content-free placeholder can reproduce per-card wrapping, so the fallback reserves the measured line counts at that band only (`md:` and `lg:` variants) and holds the column height to within 7px. This is recorded as a finding about the page, not a change to it: 144px cards at 768 are a layout defect of `pricing/page.tsx`, and fixing it was out of scope for a skeleton audit.

**Checks**

- [x] Browser re-capture at 375/768/1280 with the harness, comparing scroll heights and per-block deltas.
- [x] Focused ESLint, `pnpm --filter web typecheck` and Prettier.
- [x] No duplicate React key warnings on the pricing route.
- [ ] Re-measure pricing at 375/768/1280 and game-detail at 375 after the review follow-up (not run: no browser harness in this session).
- [ ] Pre-existing hydration mismatch in `app/[locale]/(app)/layout.tsx:51` (`Suspense fallback={<SidebarFallback />}` around the async sidebar). The file is unmodified by this task — last touched in `83c0b64` and `4e85de2` — and the warning appears on every `(app)` route, so it is not caused by these fallbacks. Left open; it needs its own investigation.
