# ODD — Internationalization with next-intl (cookie/user-scoped locale)

- Feature: `i18n-next-intl`
- File: `odd/tasks/i18n-next-intl.md`
- Engram mirror: `odd/i18n-next-intl/tasks`
- Route: delegated for routing and multi-file writes; bounded verification after each work unit
- Created: 2026-09-23
- Branch: `feat/new-flow` (worktree `/Users/gorka/workspace/worktrees/numa`)
- Status: T1–T4 complete; T5 in progress

## Objective

Internationalize the `apps/web` UI with next-intl, keeping public URLs unprefixed.
Choose a supported locale from the browser on a first anonymous visit, allow an
in-app switcher, and persist an explicit preference for signed-in users. Keep
API, webhook, preview, and checkout handlers outside locale page routing.

## Decisions and gates

- [x] **D1 — Launch locales and fallback (confirmed by user).** Launch with
  `en` and `es`; use `en` when the browser has no supported language match.
  An explicit supported cookie preference still takes precedence for an
  anonymous visitor. Create and maintain messages for both locales.
- [x] **D2 — Cross-device preference semantics (confirmed by user).** An
  explicit DB preference, when present, wins for signed-in page requests,
  including when the cookie differs or a preference changed on another
  device; otherwise use a valid cookie, then `Accept-Language`, then `en`.
  Reconcile on authenticated page rendering even if this needs an additional
  preference lookup. DB `NULL` means no explicit preference; do not write a
  default for existing users or on first sign-in. Logging in with a stored
  preference overrides an anonymous cookie; a user with no stored
  preference keeps the current negotiated language.

Both product gates are resolved. Validate the technical implementation of
these semantics in T1 rather than weakening them without asking.

## Current-state evidence and design constraints

- `apps/web/proxy.ts` returns early for public auth pages and unauthenticated
  redirects. It currently checks session-cookie **presence only**, not a
  validated session. That must stay a UX optimization, never authorization.
- `apps/web/lib/session.ts` validates sessions server-side;
  `apps/web/app/(app)/layout.tsx` requires one and resolves billing before
  exposing an interactive authenticated route.
- `apps/web/app/layout.tsx` owns `<html lang="en">` and global providers.
  A nested layout cannot independently replace the root `<html>` element.
- Page paths include `(app)`, `sign-in` (including `two-factor`), `sign-up`,
  and `games/[id]/play` outside `(app)`. Preserve their `loading.tsx` and
  `error.tsx` behavior. `app/api/**/route.ts` and `app/checkout/route.ts`
  must remain handlers at their existing URLs.
- `next-intl` is not yet declared in `apps/web/package.json`. No installed
  `node_modules/next/dist/docs/` was present in this worktree at planning
  time. The earlier next-intl design is a **proposal**, not verified evidence
  for a pinned installed version.
- Follow `AGENTS.md`: use `pnpm db:push` for schema changes, never generate or
  apply migration files. Check for a destructive prompt and stop for human
  confirmation rather than accepting it automatically.

## T1 verified integration findings

- Pinned `next-intl` **4.14.7** exactly in `apps/web/package.json` and
  `pnpm-lock.yaml`. The installed package declares peers `next ^16.0.0` and
  `react ^19.0.0`; this workspace installs Next.js 16.2.6 and React 19.2.4.
- Configured the required `createNextIntlPlugin()` wrapper in `next.config.ts`
  and its default `i18n/request.ts` discovery path. Added `i18n/routing.ts`
  with `en`, `es`, default `en`, and `localePrefix: 'never'`; added a request
  config that validates `requestLocale`, falls back to `en`, and loads the
  matching minimal JSON catalog. These are setup assets only: no current route,
  proxy, page, or layout uses them yet, so the existing app continues to render
  without a locale provider.
- `localePrefix: 'never'` is supported but still requires pages below
  `app/[locale]/`; it rewrites unprefixed requests internally. Therefore T2
  must move the page tree under `[locale]` and compose the next-intl
  `createMiddleware(routing)` result with the existing auth proxy. The early
  public-path return must not skip page localization; API/webhook/checkout
  handlers must remain excluded from locale rewriting. Keep URLs unprefixed.
- The API path is `getRequestConfig(async ({requestLocale}) => ...)`, with
  `requestLocale` awaited and validated; it can be absent or invalid and must
  fall back. The Server Component provider is `NextIntlClientProvider` from
  `next-intl`, normally in the root locale layout, with `getMessages()` from
  `next-intl/server`. The plugin is required for App Router request config;
  the installed declarations confirm the routing/plugin entry points.
- Default locale cookie is `NEXT_LOCALE`, a browser-session cookie set when
  the selected locale differs from `Accept-Language`; default `sameSite` is
  `lax`, with path `/` (or configured basePath) and no explicit `maxAge`.
  Routing resolves that supported cookie before language negotiation. D1's
  explicit cookie precedence is compatible; cookie lifetime should be decided
  deliberately when T3 implements persistence.
- Preference boundary: `requireSession()` in the authenticated shell calls
  server-only `getSession()`, which obtains request headers and asks Better
  Auth for a DB-backed session; `advanced.database.joins` loads its user in
  that query. The current `user` schema has no `locale`. T3 can add nullable
  `user.locale` and have authenticated server request configuration select
  the validated DB preference over the routed/cookie locale, using the joined
  session user where possible. Existing anonymous paths must not call the DB;
  only a session-cookie-present request may attempt validation, and cookie
  presence is never authorization. Rendering cannot write cookies: Next.js
  16.2.6 requires `.set()`/`.delete()` in a Server Function or Route Handler.
  T3 must implement a real authenticated response/action boundary that updates
  a stale/missing cookie and refreshes the selected locale; do not pretend a
  render-time `cookies().set()` is supported. Measure whether this adds a
  second session lookup versus reusing/caching the existing shell validation.
- T2 must make `[locale]` the page root layout so `<html lang>` and the
  `NextIntlClientProvider` use the resolved locale while preserving global
  providers and metadata. Next docs permit a root layout under a dynamic
  segment. Keep API and checkout Route Handlers outside the moved page tree;
  verify that boundary and loading/error files in the T2 build.
- Versioned upstream next-intl docs consulted (official project repository;
  docs source paths are pinned to the installed `v4.14.7` release):
  - Routing/`localePrefix` and locale cookie:
    https://github.com/amannn/next-intl/blob/v4.14.7/docs/src/pages/docs/routing/configuration.mdx
  - App Router plugin:
    https://github.com/amannn/next-intl/blob/v4.14.7/docs/src/pages/docs/usage/plugin.mdx
  - Request/provider configuration:
    https://github.com/amannn/next-intl/blob/v4.14.7/docs/src/pages/docs/usage/configuration.mdx
  - Middleware setup:
    https://github.com/amannn/next-intl/blob/v4.14.7/docs/src/pages/docs/routing/middleware.mdx
  - Request-locale API update:
    https://github.com/amannn/next-intl/blob/v4.14.7/docs/src/pages/blog/next-intl-4-0.mdx
- Installed Next.js documentation read completely before implementation:
  `apps/web/node_modules/next/dist/docs/01-app/02-guides/internationalization.md`,
  `01-app/01-getting-started/16-proxy.md`,
  `01-app/03-api-reference/03-file-conventions/proxy.md`,
  `01-app/03-api-reference/03-file-conventions/layout.md`,
  `01-app/03-api-reference/04-functions/cookies.md`, and
  `01-app/03-api-reference/04-functions/headers.md` (all from installed
  Next.js 16.2.6).

## Architecture to validate before changing routes

1. T1 pinned and checked `next-intl@4.14.7` against installed Next.js 16.2.6
   and React 19.2.4. `localePrefix: 'never'` does **not** avoid the route move:
   all pages still need `app/[locale]/` for the locale param and internal
   rewrite target. The default locale cookie and server request/provider APIs
   are recorded above; T2 must preserve the route and response boundaries.
2. Document the response flow for a signed-out protected page, sign-in,
   sign-up, an authenticated page, a session-expired page, API/auth, webhook,
   preview, and checkout. Decide explicitly which paths skip i18n and which
   receive it. Public auth **pages** still need locale routing if they live
   under `[locale]`; an early `NextResponse.next()` cannot bypass their
   rewrite. A redirect to `/sign-in` must land on a localized page without
   exposing a prefix. Do not pass an i18n rewrite to API/handler paths.
3. Design `<html lang>` and provider placement before moving layouts. If
   the chosen approach uses `app/[locale]/layout.tsx` as the root for page
   routes, verify that handlers outside that segment and error boundaries
   build and behave correctly; otherwise keep a root layout with a supported
   server-side locale source. Do not leave a hardcoded `lang="en"` after
   localization. Check metadata and document title/description too.
4. Specify a **real preference reconciliation boundary**, not a hypothetical
   login-only hook: for signed-in page rendering, validate the session and
   read the explicit preference using a server-only path that is already
   session/DB-backed where possible. If it differs from the cookie, update
   the cookie via a permitted mutation boundary (proxy/route handler/server
   action as supported by the installed versions), then render/refresh in
   the chosen locale. Server components must not silently attempt to write
   cookies during rendering. Cover existing sessions, new browsers, deleted
   cookies, sign-in, sign-out, and preference changes from another device.
   A request-time DB lookup may be necessary to **guarantee** DB precedence;
   do not claim DB > cookie and no request-time validation simultaneously.
   Measure the added query/latency against the authenticated shell and avoid
   extra reads if the existing validated session path already supplies it.
   Keep anonymous paths DB-free. If strict precedence is too costly, return
   to the user for an explicit change to D2 rather than silently weakening
   the promise.

## Work units (one functioning commit per completed unit)

- [x] **T1 — Validate integration.** Implement the recorded D1/D2 decisions.
  Verify the actual installed next-intl and Next.js APIs, routing/layout
  choice, cookie options and response composition, and the preference
  read/write boundary above. Add dependency and minimum locale config/messages. No proxy or route changes yet; the current app must
  remain usable. Route: delegated scout for multi-file mapping, then bounded
  writer if installation/config touches multiple files. Checks: install
  succeeds; focused typecheck; record doc/version and design evidence.
- [x] **T2 — Integrate page routing atomically.** In one functional work unit,
  compose `proxy.ts` with locale handling **and** create the required page
  route/layout structure. If `[locale]` is required, move `(app)`, sign-in
  (catch-all and two-factor), sign-up (catch-all), and
  `games/[id]/play` pages with their relevant loading/error boundaries.
  Preserve global providers, auth guards, root HTML language, and unprefixed
  navigation/redirects. Keep `api/**` and `checkout/route.ts` outside locale
  pages; preserve preview token auth and Polar webhook reachability. Use
  next-intl navigation helpers where required; do not assume every plain
  `next/link` needs replacing. Route: delegated writer (multi-file).
  Checks: typecheck, lint, build; manual route matrix below. Do not commit
  an intermediate proxy rewrite pointing to absent pages or moved pages
  without a matching rewrite. If too large, first create a backward-
  compatible bridge and verify it before splitting into separate commits.
- [x] **T3 — Persist and switch preferences.** Add nullable `user.locale`
  (or an equivalent explicitly chosen preference store) in
  `packages/db/src/schema.ts`; validate permitted values at the app boundary
  and apply via `pnpm db:push` after inspecting any prompt. Implement a
  server-only preference update, signed-in reconciliation per D2, and an
  in-app switcher for authenticated and anonymous use. Cookie changes must
  take effect without a URL change; ensure the cookie's path, lifetime,
  same-site/secure settings, and invalid-locale fallback are deliberate.
  Do not write to DB based solely on an anonymous cookie or accept a client-
  supplied user ID. Route: delegated writer; split only at a demonstrably
  functional boundary. Checks: typecheck, lint, build; preference matrix
  below and shell latency comparison. Never report DB persistence complete
  if `db:push` or its confirmation was skipped.
- [x] **T4 — Translate user-visible copy in bounded slices.** Each slice
  includes both language files and a render/smoke check; preserve existing
  fallback behavior until its slice is complete. One writer and one commit
  per independently working slice; no parallel writes in this worktree.
  Inventory strings first, including shared components, metadata,
  validation/toast/error text, accessibility labels, and server-generated
  user-visible copy; do not translate API protocol values or persisted
  identifiers.
  - [x] T4a: shell, navigation, layouts, loading states
  - [x] T4b: sign-in, sign-up, two-factor, account settings
    - [x] Auth source/catalog unit (native review stopped; no approval)
    - [x] Settings personal/dialog/catalog unit (`b0a2230`, `084c713`)
    - [x] Settings security/passkey/session unit (`2749aec`)
  - [x] T4c: pricing, checkout-facing copy, billing settings
    - [x] Pricing plan cards, top-ups, alerts, and locale-aware amounts
    - [x] Pricing FAQ copy
    - [x] Plan-change preview and confirmation dialog copy
    - [x] Billing settings plan/loading/action copy and locale format
    - [x] Billing history states and known provider-status labels
    - [x] Sidebar upgrade nudge copy
  - [x] T4d: games, play, chat composer/thread
    - [x] Composer, suggestions, and model tiers
    - [x] Game management menu and errors
    - [x] Chat messages and copy actions
    - [x] Chat thread, thinking, and task-strip states
    - [x] Tool group and tool-part display labels
    - [x] Agent panel tabs/navigation and preview controls
    - [x] Agent entries and run details
    - [x] Game preview and play view
  - [x] T4e: errors, empty states, tooltips, metadata, remaining inventory
    - [x] Home empty state, error boundary, and metadata
    - [x] Fixed game-creation action errors
    - [x] Shared mobile sidebar/drawer accessibility
    - [x] Shared spinner accessibility inventory and resolution
    - [x] Two-factor step-up errors at server source
    - [x] Credit badge and balance formatting
    - [x] Chat scroller accessible buttons
    - [x] Dialog close accessible labels
    - [x] Toast close accessible label
    - [x] Dynamic provider-error policy and residual copy sweep
  Checks per slice: typecheck, lint, relevant render checks; track missing
  keys and untranslated/hardcoded strings. The earlier ~49-file estimate
  is a forecast, not a verified exhaustive inventory.
- [ ] **T5 — Final verification and close.** Run root `pnpm typecheck`,
  `pnpm lint`, `pnpm --filter web build`, verify both locales and the full
  matrices, inspect dynamic/static rendering and caching consequences of
  cookie/session reads, and record failures or skipped browser checks.
  Check accessibility (`html lang`, labels), no locale prefix, provider
  redirects, and no request secrets in client bundles. Route: delegated
  command-running verifier. Report actual results and next action.

## Runtime matrices (record observed outcomes, not intentions)

- Signed-out `/` redirects to unprefixed `/sign-in` and renders in the
  negotiated locale; direct `/sign-in` and `/sign-in/two-factor` render
  without auth loops or locale-prefixed URLs. `/sign-up` retains the existing
  one-hop redirect to `/sign-in` (social sign-in also creates accounts).
- Signed-in `/`, `/pricing`, `/games/[id]`, `/games/[id]/play` render with
  correct locale and retain auth/billing behavior; an expired cookie cannot
  grant access. Exercise loading/error boundaries and direct refreshes.
- `api/auth/**` (including OAuth callbacks), Polar webhook, preview iframe,
  billing APIs, and `/checkout` keep their pre-existing handler semantics;
  no locale rewrite or session-cookie-presence check becomes authorization.
- Anonymous first visit: supported `Accept-Language`, unsupported language,
  missing header, invalid cookie, and cookie persistence. Switch locale and
  refresh a deep link; URL must remain unprefixed.
- Authenticated: no DB preference uses negotiated locale; explicit DB
  preference wins over a conflicting anonymous cookie at sign-in; existing
  sessions, new browser, deleted cookie, and cross-device change reconcile
  according to D2; switcher persists in DB and cookie; signed-out switching
  does not mutate the former user's DB preference. Verify invalid input and
  failed DB writes do not claim success.
- Compare authenticated shell response time/query count before and after
  preference reconciliation. Inspect build output for changed rendering or
  caching and document the accepted tradeoff.

## Delivery and verification policy

- Forecast: high review workload; string extraction across many files is
  sliced as T4a–T4e. The user selected `feature-branch-chain` after the
  cumulative branch passed the ~400-authored-line review threshold; no PR,
  push, or merge is authorized yet. Plan future PR slices in dependency order:
  T1 (`769ee1c`), T2 (`4e85de2` + `84ef4b2`), T3 (`48be473`), then each
  independent T4 slice and T5. Use a draft/no-merge tracker if PR creation is
  later requested. The ~400-line per-task target is advisory, never a reason
  to omit translations, tests, comments, or needed behavior.
- TDD is currently off (no web test runner configured). Typecheck/lint/build
  alone do **not** prove routing or preference behavior. If no automated
  browser harness exists, record each manual check as executed or pending,
  with environment and result; never mark a behavioral criterion verified
  solely because compilation passed.
- Keep generated technical artifacts in English unless the selected UI
  locale requires translated values. Conventional work-unit commits on the
  feature branch; no push/PR/merge without user direction.

## Acceptance criteria

1. Selected launch locales and fallback are recorded; no locale prefix
   appears in page URLs, links, auth redirects, or deep-link refreshes.
2. Anonymous first visit negotiates a supported locale from
   `Accept-Language` or falls back; explicit cookie selection wins until
   changed. Invalid cookie/locale input fails safely.
3. Signed-in explicit preference and cookie obey D2, including session
   transitions and cross-device cases; switcher persists appropriately.
4. Auth and billing authorization, public routes, APIs, checkout, webhook,
   and preview behavior remain intact.
5. Both launch locales cover the audited user-facing string inventory,
   accessible labels, metadata, errors, and loading states; `html lang`
   matches rendered text.
6. Typecheck, lint, build, and observed routing/preference matrices are
   recorded with any unexecuted runtime checks identified explicitly.
7. Each completed work unit/slice has a verified outcome and conventional
   commit identity recorded below.

## Progress / evidence

- [x] Read-only plan review identified proxy early-return, route-move,
  root-layout, and DB/cookie precedence gaps; amended planning only.
- [x] D1/D2 confirmed by user: `en` + `es`, fallback `en`; explicit account
  preference wins across devices on authenticated page requests.
- [x] T1 integration and checks complete (Next.js 16.2.6 and
  next-intl 4.14.7 installed; no routes or preference logic changed).
  Route: delegated scout and bounded writer. TDD: off
  (`openspec/config.yaml` strict_tdd=false); no web test runner.
  Checks: `pnpm install` passed; `pnpm --filter web typecheck` passed
  after generated types existed; independent rerun passed; `pnpm --filter
  web lint` passed twice (0 errors, 25 existing warnings); `pnpm --filter
  web build` initially compiled and typechecked twice but failed during
  page-data collection at `/api/auth/[...all]` because `DATABASE_URL` was
  missing. After copying the ignored development environment file from the
  original worktree, an independent `pnpm --filter web build` passed with
  TypeScript checks and static page generation complete (Node.js
  `module.register()` deprecation warning). `git diff --check` passed.
  No route/browser or DB-preference behavior verified yet (T2/T3).
  Work-unit commit: `769ee1ce102f46c41c9bb85d179527ec18fca8cc`
  (`feat(web): establish next-intl locale configuration`); native medium-tier
  reliability review approved and acknowledged on that committed candidate.
- [x] T2 atomic page routing and proxy integration.
  The root layout now lives at `app/[locale]/layout.tsx`, validates `en`/`es`,
  sets `<html lang>` from the route, and provides request messages through
  `NextIntlClientProvider` while retaining metadata, fonts, and global providers.
  `proxy.ts` composes next-intl routing with the existing cookie-presence UX
  gate: public auth pages receive locale routing; API, tRPC, checkout, webhook,
  and preview handler paths bypass locale middleware; non-public handlers retain
  the prior cookie gate. The internal `x-next-intl-locale` rewrite request is
  handled idempotently so rewritten auth pages remain public and protected pages
  remain gated. Moved dynamic game pages now use the `[locale]` route type.
  Checks: `pnpm --filter web build` passed and generated the `[locale]` page
  routes while retaining API/webhook/preview/checkout handlers at their original
  URLs; final `pnpm --filter web typecheck` passed; `pnpm --filter web lint`
  passed with 0 errors and 25 existing warnings. A pre-build typecheck used
  stale generated route types after the parent relocation and failed; build
  refreshed them. Production `curl` smoke: `/sign-in` with `Accept-Language: es`
  returned 200 with `html lang="es"`; absent/unsupported `fr` returned 200 with
  `html lang="en"`; signed-out `/` and `/checkout` redirected to unprefixed
  `/sign-in`; `/sign-up` redirected there; invalid preview token returned 404;
  Polar webhook GET returned 405 without a locale rewrite. Independent
  verification repeated typecheck, lint, build and localhost GET checks:
  `/sign-in/two-factor` returned 200 in `es`, `NEXT_LOCALE=es` won, invalid
  cookie fell back to `en`, and `/es/sign-in` redirected 307 to unprefixed
  `/sign-in`. Signed-out `/pricing` and `/games/example/play` redirected 307
  to `/sign-in`; `/api/auth/get-session` returned 200. `/sign-up` redirected
  one hop to `/sign-in`, matching its unchanged redirect-only source.
  Signed-in, valid preview, OAuth callback, webhook POST, and exercised
  error/loading boundary behavior remain untested. Work-unit commit:
  `4e85de2258f35f9f7fe5d46034e78e39ec4188a4`.
  Explicit committed-range inspect at base `769ee1c` offered the T2+progress
  slice ending at `84ef4b2`; native medium-tier reliability review approved
  and acknowledged (`review-0fbbc3c19cbcdba3`). Advisory `R3-001` at
  `apps/web/proxy.ts:80` is informational and non-blocking; follow up
  separately. Route: delegated writer (multi-file) and independent verifier.
- [x] T3 preference persistence and switcher: nullable `user.locale`, request-time DB > cookie >
  language-header resolution, server actions, cookie reconciliation, and
  anonymous/authenticated switchers implemented. Independent typecheck, lint
  (0 errors, 27 warnings), and build passed before schema push. The first
  `pnpm db:push` on the explicitly authorized Neon `production` branch stopped
  before mutation: it proposed dropping populated `games.template_id` and
  `games.template_version` (8 rows each) because this worktree lacked the
  original worktree's uncommitted game-template declarations. After the user
  authorized taking those schema changes from the original worktree, added
  exactly those two declarations while preserving `user.locale`; a second
  `pnpm db:push` completed with `[✓] Changes applied` and no data-loss prompt.
  No migration files or ad hoc DDL were used. Independent verification after
  push: typecheck, lint (0 errors, 27 warnings), and build passed; a read-only
  `information_schema.columns` query confirmed `user.locale` exists and is
  nullable, while both template columns remain present and non-nullable.
  Switcher now refreshes the current route after a successful server action.
  T3 work-unit commit: `48be47392dd936ca035b9f6ebcffff1050edfa5e`.
  Native high-tier four-lens review approved and acknowledged
  (`review-d078d68de0138c3d`); non-blocking advisories R2-001,
  R3-001, and R4-001 are separate follow-ups, not corrections to that
  receipt. Independent post-push anonymous production-server GET smoke:
  `/sign-in` en/es/fr rendered `html lang=en/es/en`, `NEXT_LOCALE=es`
  rendered `es`, invalid cookie fell back to `en`, and the URL stayed
  unprefixed. A first smoke attempt failed before readiness (HTTP 000);
  a bounded 30-second readiness retry passed. The user manually exercised
  the authenticated switcher, refresh/deep link, DB-over-conflicting-cookie
  sign-in, cross-device preference change, and sign-out/anonymous switch on
  the local worktree server and reported all working; this is user-reported
  runtime evidence, not an independently observed browser trace. The user
  reported no noticeable authenticated-page slowdown. Quantitative shell
  query-count/latency measurement remains pending for T5, as do valid
  preview/OAuth/webhook POST and error/loading scenarios.
- [x] T4 source inventory and bounded translation slices T4a–T4e complete; runtime matrix remains T5.
  - [x] T4a shell/navigation slice complete. The `Shell`
    namespace now has 22 matching keys in `messages/en.json` and
    `messages/es.json`, covering shell navigation, account menu, command
    palette, credits navigation, mobile sidebar trigger, and the locale-switcher
    language label. Game rows display only user-provided game titles; the scoped
    app layout and four loading fallbacks contain only skeletons, with no visible
    copy to translate. `pnpm --filter web typecheck` passed; lint passed with
    0 errors and 27 warnings; build and `git diff --check` passed. Independent
    public render smoke: `/sign-in` with `Accept-Language: en`/`es` returned
    HTTP 200, `<html lang=en/es>`, translated `Language`/`Idioma`, and no URL
    prefix. The locale-switcher failure toast is translated; account-menu
    errors still display nonempty server error details with a translated
    fallback. Shared UI drawer title/description and slice-owned app settings,
    billing and metadata remain for T4e/T4b/T4c/T4e respectively.
    Authenticated navigation render is not independently observed; carry it
    explicitly to T5. Interrupted writers' final review-facade reports did
    not reflect their already-written changes, so independent verification
    read back the actual diff and reran checks before closing this slice.
    Work-unit commit: `b872085ea4b6d4a8d5fd6ad29f2558ce0975d6d1`;
    native medium-tier reliability review approved and acknowledged
    (`review-aa7263fee82bcb83`).
- [x] T4b Auth and Settings sources complete; T4c–T4e not started. Auth was split into
  `4da225cde3f3bac4c30823fabb3bad67d7ae29e7` and its bounded tuple
  correction `04abcf5bfc67b9f725450966a292f18371ad19b9`. The four-lens
  native review `review-85adb0efbe03e39f` requested correction R3-001;
  after the 2-diff-line correction passed typecheck/lint/build, bound STATUS
  returned terminal `captured_artifacts_unverifiable`. No approved or burned
  authority exists for this Auth unit; do not replay capture/start or claim
  review success. The user first chose maintainer inspection. Read-only native
  `inspect-authority` found one valid compact entry,
  no invalid edges or diagnostics; `repair --preflight` reported `unsupported`
  with zero eligible candidates. Bound STATUS still offers only terminal
  `captured_artifacts_unverifiable`; no safe in-tool repair continuation was
  identified. The user then explicitly chose `gentle-ai review mode disable
  --scope clone`; mode status confirmed `off (decided by clone_local)`. Continue
  under ordinary repository policy with independent verification; do not claim
  Auth is approved. Settings was split into personal/dialog/catalog and
  security/passkey/session commits below 400 diff lines each. The delegated
  writer reported a missing review facade after it had already written the
  T4b diff; independent verification reconciled the actual worktree. The
  remaining hardcoded Retry labels in the passkeys and authenticator setup
  components using the existing `Settings.retry` translations, and removed
  duplicate `Settings.invalidCode` entries while retaining their existing
  values in both catalogs. Independent checks: `pnpm --filter web typecheck`
  passed; `pnpm --filter web lint` passed with 0 errors and 30 warnings;
  `pnpm --filter web build` passed and generated the locale routes and
  handlers. Independent public `/sign-in` smoke
  with `Accept-Language: en`/`es` returned HTTP 200 and translated AuthPage
  headings; typecheck, lint (0 errors/30 warnings), build, and diff check
  passed. All 125 referenced keys were present in both catalogs. Authenticated
  settings, passkey/session actions, and two-factor behavior remain unverified
  for T5. Settings personal/catalog commit `b0a2230d345fb2126f820348d1ec58068e5f1ab4`
  and tab-label correction `084c71381712ef00298b7710c55d60a9ed34bc96`
  passed independent checks. Settings security commit
  `2749aec8b262eee7229b1959d8c44f560dc4e0bf` has 364 diff lines,
  assessed high risk under RDD off and independently passed typecheck/lint
  (0 errors/30 warnings)/build, key and placeholder parity. Authenticated
  settings render and flows remain T5. Better Auth dynamic error messages in
  passkey/security actions are preserved as before and may remain English;
  include their user-facing
  localization policy in T4e's error sweep. Independent precommit Security
  audit found no missing Settings keys or placeholder mismatch; typecheck,
  lint (0 errors/30 warnings), build, and diff check passed.
- [x] T4c copy slices complete: read-only inventory mapped pricing, plan-change dialog,
  billing settings, and upgrade card. Checkout route is Polar-owned protocol
  and must not be translated. Split pricing because the server page alone is
  606 lines; keep each reviewable unit under 400 diff lines. First pricing
  unit translated plan cards, top-ups, alerts and locale-aware USD amounts/
  credit counts, preserving product IDs, checkout links and business values;
  both catalogs match. Independent typecheck/lint (0 errors/30 warnings)/build
  and diff check passed. Anonymous pricing smoke redirected to sign-in (307),
  so authenticated render remains T5; FAQ and plan-change copy remain for the
  next unit. Work-unit commit: `ff1f2efbde30caceaa6615e8bd170ac78113445f`.
  FAQ unit translated all seven Q/A pairs in both locales without changing
  accordion IDs or billing rules; independent typecheck/lint (0 errors, 30
  warnings)/build and diff check passed. Authenticated render remains T5.
  Plan-change preview/dialog unit translated estimates, dates, known billing
  cadence, and confirmation copy, preserving action bindings and unknown
  interval fallback. Independent typecheck/lint (0 errors, 30 warnings)/build,
  catalog parity, and diff check passed (203 diff lines); authenticated plan
  change flow remains T5. Work-unit commit:
  `198bc75b19f620be5115bac6c3d1bbfe2142ff5c`.
  Billing core unit translated plan/loading/unavailable/action copy, known
  cadence and next-event labels, and active-locale plan date/currency/credit
  formatting; provider values and API paths preserved. Independent typecheck,
  lint (0 errors/30 warnings), build, key/placeholder parity and diff check
  passed (229 source/catalog diff lines). Billing history dates/status/order
  copy remained for the next unit; authenticated rendering remains T5.
  Billing history unit translated loading/unavailable/empty states, known
  Polar order status display, invoice/receipt labels, and locale-aware order
  dates/currency. Unknown statuses preserve humanized provider fallback and
  order descriptions remain provider-owned. Independent typecheck/lint (0
  errors/30 warnings)/build, key parity, and diff check passed; no covering
  status-mapping unit tests were found. Authenticated history render remains
  T5. Billing core commit `adc4ca499b8dec7f163ffe320476428607d3a274`;
  history commit `5d147aa1f41fd2dd893520fce6451002ba7b36ad`.
  Sidebar upgrade nudge translated using shared Pricing copy and active-locale
  USD display; independent typecheck/lint (0 errors/30 warnings)/build and
  diff check passed. Its checkout href, plan gate, and dismissal behavior
  remain unchanged. Work-unit commit recorded after creation.
- [x] T4d source slices complete: read-only mapping identified six bounded UI slices. Keep
  user-authored game titles/messages and agent-generated content untouched;
  translate fixed controls/labels without changing tier/tool IDs or API
  protocol. Authenticated smoke checks remain T5 when credentials are not
  safely available. Composer unit translated suggestion labels and sample
  prompts, picker labels/taglines, default placeholder and accessible controls;
  suggestion IDs are stable and tier/form-data values unchanged. Independent
  sequential build, typecheck, lint (0 errors/30 warnings), catalog parity,
  and diff check passed (130 source/catalog diff lines). The writer's initial
  concurrent typecheck/build raced on generated `.next/types/routes.js`; the
  sequential rerun passed. Authenticated home render/submit remains T5.
  Game menu unit translated controls/dialogs and fixed rename/delete/pin
  Server Action errors, preserving game titles verbatim, UUID/user predicates,
  sandbox-before-row deletion and redirect behavior. Independent build,
  typecheck, lint (0 errors/29 warnings), key/interpolation parity, and diff
  check passed (93 diff lines). Pin failure remains silent as before, while
  arbitrary thrown errors and createGame fixed errors remain for T4e/T5.
  Chat-message unit translated fixed ask-player/copy/turn-detail controls and
  known tool display labels, leaving agent/user content, clipboard payloads
  and unknown tool names unchanged. `chat-message.tsx` had no app-owned copy.
  Independent build/typecheck/lint (0 errors/29 warnings), key parity and diff
  check passed (105 diff lines); interactive chat render remains T5.
  ChatActivity thread/thinking/task-strip unit translated placeholder, error
  title, rotating/reconnect copy and accessible task status/counts; agent
  task titles/activity, transport and dynamic error.message were untouched.
  Independent build/typecheck/lint (0 errors/29 warnings), ICU parity, and
  diff check passed (85 diff lines); interactive chat render remains T5.
  Tool-marker UI unit translated all 12 known tool labels in three phases,
  grouped read/edit/failure summaries and preserved raw paths/errors and
  unknown-tool fallback. Shared `tool-parts.ts` remained unchanged because its
  labels also feed live/persisted subagent activity; subagent detail labels
  remain for the next slice. Independent build/typecheck/lint (0 errors/29
  warnings), catalog parity, and diff check passed (185 diff lines).
  Agent panel navigation unit translated desktop/mobile tabs, preview controls,
  subagent panel headings/empty states and accessible toggles while preserving
  generated run content. Independent build/typecheck and scoped web lint
  passed (0 errors/29 warnings), catalog parity and diff check passed (97 diff
  lines). An extra root `pnpm lint` check failed in pre-existing `packages/db`
  because it lacks `eslint.config.js`; track it as a T5 workspace blocker,
  not evidence of a panel regression. Mobile drawer runtime remains T5.
  Agent entry/run-detail unit translated eight status enum displays across
  inline/list/detail, fixed detail copy and token formatting, and known tool
  call labels via UI-only helper, leaving persisted activity, unknown tools,
  raw paths/errors and generated content unchanged. Independent build,
  typecheck, scoped lint (0 errors/29 warnings), key parity and diff check
  passed (168 diff lines); interactive agent panel remains T5.
  Preview/play unit translated iframe/title/status/retry/fullscreen controls
  and async page metadata, preserving game title, owner-scoped notFound,
  sandbox paths and interactions. Independent build/typecheck/scoped lint,
  catalog parity and diff check passed (90 diff lines). No covering
  GamePlayView test was found; authenticated preview/play remains T5.
- [x] T4e source slices complete: read-only residual inventory found fixed home/error/metadata
  copy, fixed createGame action errors, shared sidebar/drawer accessibility,
  shared spinner defaults, and dynamic Better Auth errors. Preserve provider
  error details pending a stable-code policy; do not translate arbitrary
  English error.message text by matching its prose. Run each bounded unit
  through independent verification before T5. Home/error/metadata unit
  translated fixed empty/error UI and SEO description without changing the
  Numa title template or retry action. Independent build/typecheck/web lint
  (0 errors/29 warnings), catalog parity and diff check passed. Anonymous
  `/sign-in` metadata descriptions matched English and Spanish; the error
  boundary itself and authenticated home remain unexercised for T5.
  createGame fixed prompt/insert errors now use request-scoped GameComposer
  translations; state shape, authentication, tier, insert and redirects remain
  unchanged. Independent build/typecheck/web lint (0 errors/29 warnings),
  catalog parity and diff check passed; action runtime failure paths remain T5.
  Shared sidebar unit introduced optional English-default labels in packages/ui
  and a client `LocalizedSidebarProvider` in both authenticated shell and
  fallback. Drawer title/description and trigger/rail controls now follow
  Shell locale without an extra server request. Independent build/typecheck/
  web lint (0 errors/29 warnings) and diff check passed; mobile drawer
  accessibility runtime remains T5.
  App-level localized Spinner wrapper now supplies Common.loading to all 18
  app callers under NextIntlClientProvider while preserving explicit labels,
  decorative state and SVG props; shared UI Spinner/toast remain generic.
  Independent build/typecheck/web lint (0 errors/29 warnings), import audit,
  catalog parity and staged diff check passed (84 source/catalog diff lines).
  Spoken loading labels in a browser remain T5.
  Two-factor step-up actions now map structured Better Auth codes to existing
  localized Settings messages on the server; unknown errors use generic copy
  without leaking raw content. Removed brittle English-prose matching in the
  client. Independent security-focused audit verified auth-before-translation,
  TOTP-before-mutation order and unchanged guards; build/typecheck/web lint
  (0 errors/29 warnings) and diff check passed. Live TOTP remains T5.
  Credits sidebar unit translated Free badge and locale-formatted numeric
  balance, preserving null dash, unknown-plan absence, Pro/Max names and
  pricing link. Independent build/typecheck/web lint (0 errors/29 warnings),
  catalog parity and diff check passed; runtime remains T5.
  Chat scroller unit passed the locale's `scrollToEnd` label into the shared
  MessageScrollerButton; its default English start/end fallback, direction,
  icon and custom children remain unchanged. Independent build/typecheck/web
  lint (0 errors/29 warnings), catalog parity and diff check passed.
  Dialog close unit supplied Common.close to all five app DialogContent
  callers; shared primitive keeps English default, 2FA pending guards remain.
  Independent build/typecheck/web lint (0 errors/29 warnings), catalog parity
  and diff check passed (30 source/catalog diff lines). Unused SheetContent
  retains its generic default.
  Toast close unit added a client wrapper under the locale provider and an
  optional English-default label in shared UI; independent build/typecheck/
  web lint (0 errors/29 warnings), full catalog parity and diff check passed.
  Browser toast dismissal remains unverified for T5. Commit `c8ebe1a`.
  Provider-error inventory found Better Auth 1.7.5 structured TOTP codes
  (already mapped at TOTP boundaries) and passkey cancellation codes; Polar
  SDK 0.49.0 has endpoint-specific error types/status but no universal stable
  translation code. Policy for ordinary provider failures: localize an
  allowlisted structured code only in its relevant flow, otherwise show an
  existing application-owned translated generic error; never compare English
  prose, expose untrusted provider text as a localized message, or alter
  user/agent-authored content. Auth social/passkey and account switch/sign-out
  now use generic translated fallbacks; OAuth callback known-code mapping and
  passkey cancellation remain intact. Independent typecheck/web lint (0 errors,
  29 warnings)/build, source audit and diff check passed; commit `e34baf1`.
  Settings profile/passkey/session/security/2FA revoke error surfaces now use
  `Settings.genericError`, retaining `ERROR_CEREMONY_ABORTED` suppression and
  TOTP `INVALID_CODE` mapping. Independent typecheck/web lint (0 errors,
  29 warnings)/build, source audit and diff check passed; commit `597e4a3`.
  Neither unit exercised authenticated failure paths in a browser.
  The user chose application-owned structured codes for actionable chat
  failures rather than preserving raw stream details or hiding every failure
  behind a generic message. The missing-game branch now emits a separate
  transient `data-game-unavailable` event; actual credit refusals retain
  `data-credits-exhausted` with `null` for unprovisioned accounts and a
  non-positive number for exhaustion. The hook validates both payloads and
  clears classification on the next send/answer/reconnect; the alert shows
  actionable translated copy for those cases and generic translated copy for
  unclassified stream failures. Model-facing tool errors and server-thrown
  diagnostics remain unchanged. Keying the chat thread by game ID prevents
  prior-game hook state from contaminating a new game. Independent sequential
  build/typecheck/web lint (0 errors, 29 warnings), catalog audit and diff
  check passed; commit `391b375`. Installed AI/Trigger SDK source preserves
  streamed transient data-before-error ordering, but browser delivery and a
  hypothetical late same-game event after a new send remain unverified for T5.
  Final residual source inventory found one app-owned gap: session device
  labels. Both current and other sessions now localize the unknown-device
  fallback and browser/OS connector while retaining browser/platform names
  and an English-default formatter. Independent typecheck/web lint (0 errors,
  29 warnings)/build, placeholder parity and diff check passed; commit
  `e5f3bea`. Authenticated session render remains T5. Recovery-code
  `XXXXX-XXXXX` is a format hint, deliberately locale-invariant, not English
  prose. Brand, product names, shortcuts, IDs, paths, provider order
  descriptions and user/agent content are excluded from translation.
- [ ] T5 in progress. Independent sequential checks on `e5f3bea` plus this
  ODD edit: root `pnpm typecheck` passed (3/3 tasks); root `pnpm lint` failed
  in `packages/db` because that package has no `eslint.config.js` (known
  workspace baseline, not evidence of an i18n regression); `pnpm --filter
  web build` passed, with 1 static `/_not-found` route and 14 dynamic routes
  including `[locale]` pages and separate API/auth/billing/preview/webhook/
  checkout handlers; `pnpm --filter web lint` passed (0 errors, 29 warnings);
  `git diff --check` passed. Build classification and separated handler routes
  do not prove middleware runtime semantics. No credentials or localhost server
  were used. No authenticated or public browser matrix was run in T5; prior
  anonymous smoke and user-reported authenticated T3 checks remain recorded
  above and must not be upgraded into independent T5 evidence.
  Read-only source audit: `i18n/request.ts` and `lib/locale-preference.ts`
  imply one explicit user-locale SELECT on an authenticated request resolving
  locale, and the hydrated `LocaleReconciler` action adds another SELECT on
  invocation after session validation; this is an **estimate**, not measured
  query count. Better Auth session SQL and billing costs are not counted.
  Anonymous locale resolution skips preference reads without a session cookie;
  cookie presence alone remains a UX gate, not authorization. `headers()` and
  `cookies()` make page locale request-dependent; build classifies the pages
  dynamically. Server actions and `server-only` imports protect preference
  code by design, but emitted client-bundle secret absence has not been
  audited. A bounded emitted-artifact scan of 172 client chunks and 121
  manifests found no literal `lib/locale-preference`, `lib/session`,
  `DATABASE_URL`, `CLERK_SECRET_KEY`, or `POLAR_ACCESS_TOKEN`; one client chunk
  contains the literal name `TRIGGER_SECRET_KEY`. No value or excerpt was
  printed. A structure-only follow-up classified all four occurrences in
  that single chunk as error-message tokens, not an assignment/property
  occurrence. A broader structure-only scan found 87 sensitive-name pattern
  matches across 18 chunks without inspecting any values; it cannot establish
  whether a value is a credential. Thus exhaustive client-bundle secret
  absence is **inconclusive**, not passed; no evidence that the specific
  `TRIGGER_SECRET_KEY` marker itself is an inlined credential was found.
  Quantitative baseline/current shell TTFB and SQL-count comparison
  remains unexecuted: no authorized authenticated measurement harness or
  credentials, and the original localhost:3000 server must not be replaced.
  A separate read-only static route/locale audit confirmed
  `localePrefix: "never"`, preference order, anonymous locale-path skip,
  request validation before DB preference access, and distinct handler
  route types. Both catalogs have 507 flattened keys with matching key and
  placeholder names; 406 statically resolved namespaced translation calls
  across 157 TS/TSX files had no missing keys. Dynamic computed keys and
  full ICU parsing were outside that scan. Its initial inline script failed
  with a syntax error, then a corrected rerun passed; no files changed.
  Signed-in pages, auth/billing actions, valid preview, OAuth callbacks,
  webhook POST, loading/error boundaries, chat structured failure delivery,
  accessibility labels, deep-link refresh and cross-device cases remain
  pending independent runtime observation. A late same-game transient chat
  failure event might misclassify a later error; no turn ID or browser trace
  establishes whether this race is reachable.

## Next step

T5 remains open for independently observed runtime matrices, a client-bundle
secret audit and quantitative baseline/current authenticated shell latency
and SQL counts. Root lint's missing packages/db ESLint config is a pre-existing
workspace blocker. Do not use credentials or displace the original localhost:3000
server; request an authorized isolated test harness before executing authenticated
checks. Until then preserve the pending results without claiming acceptance.
T4a's authenticated navigation render and chat failure delivery remain pending.
Engram topic `odd/i18n-next-intl/tasks` was updated with a recovery summary,
not a full-document mirror; full mirror remains pending. This file is the
complete task record.
