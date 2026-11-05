# Cache Components + Partial Prefetching

Objective: adopt `cacheComponents` and `partialPrefetching` in apps/web (Next 16.4.5). Branch: feat/cache-components (from chore/next-skills-and-deps, unpushed). Delivery: ask-on-risk, stacked branches. Runner: `pnpm --filter web typecheck`, `pnpm test`, `next build`.

## Specs

- S1: "Y porque lo estimas en tanto tiempo? Es mucho cambio? Estas dos cosas aportarían mejores prácticas, mejor código, nuevas soluciones de nextjs y más velocidad en la app, así como en la navegación?" and "Vale si, esq tienen buena pinta esas dos cosas, me parecen importantes meterlas": enable Cache Components and Partial Prefetching.
- S2: Locale keeps the same precedence (DB preference > cookie > Accept-Language > default) but the root layout no longer reads cookies/headers/DB; Server Components read the `[locale]` root parameter (`next/root-params`); Server Actions and Route Handlers, which have no root parameters, keep the DB > cookie > Accept-Language resolution. (Assumption: the cookie reconciliation carries the DB preference to the next render.)
- S3: Each route is adopted top-down against `next dev` + browser: dev overlay clean AND `next build` passes. Dynamic reads go behind `<Suspense>` or `"use cache"`.
- S4: `export const dynamic = "force-dynamic"` in `app/api/billing/{summary,details}/route.ts` is incompatible with Cache Components and must go.
- S5: Partial Prefetching follows `next-partial-prefetching-adoption`: audit `<Link prefetch>`, flag-off baseline first, then enable.

## Tasks

- [x] T1 (S3, S4): flag on, remove force-dynamic, codemod opt-outs, build green. Route: inline. Commit: bdb2488 (build, typecheck, lint, 640/640 tests)
- [x] T2 (S2, S3): root layout locale from params; remove root opt-out. Route: inline. Commit: 8c991fd (build green without root opt-out; browser-verified)
- [~] T3 (S3): adopt routes top-down, one feature at a time. Route: inline. Commit: 918c7ad ((app) zone) + next commit (auth routes). Pending decision: shell design and two-factor block.
- [ ] T4 (S5): Partial Prefetching. Route: inline. Commit: pending

## Log

- L1 (2026-11-05): "Vale si, esq tienen buena pinta esas dos cosas, me parecen importantes meterlas"
- L2 (2026-11-05): "Ah irán con una nueva rama intermedia eso te iba a decir, porque si activas la opción y se rompe por así decirlo igualmente, lo mismo le da una opción q otra. La que prefieras veas mejor y te sientas más cómodo haciendo" -> chose the incremental path (checkpoint with opt-outs first).
- L3: T1 findings. `crypto.randomUUID()` in games/layout.tsx blocked even with the opt-out; wrapped in a temporary connection() + Suspense (TODO marker, revisit in T3). `Failed to provision Polar billing customer` is logged at build because AuthenticatedShell reads the session during prerender and the "never throws" catch logs the rejected headers(); noise only, nothing provisioned. Disappears when (app) layout is adopted in T3.
- L4: T2 design. next/root-params cannot be used in Server Actions or Route Handlers (Next docs), so i18n/request.ts has two paths: root param in components (prerenderable), account > cookie > Accept-Language in actions and handlers (unchanged behaviour). Verified in Chrome: cookie=en with account=es renders en first, then es after ~0.75 s (reconcileLocaleCookie now returns whether it changed and LocaleReconciler calls router.refresh()); a Route Handler with cookie=en answered es (account wins). Trade-off: one-time flash on a device whose cookie differs from the account. Possible mitigation: set the cookie at sign-in.
- L5: T3 (app) zone. Removed every opt-out under app/[locale]/(app) (layout, home, library, pricing, profile, games layout and page, dev screens): `next build --debug-prerender` passes, dev log shows no insights, overlay 0. Finding: the (app) layout puts the whole authenticated shell, children included, in one Suspense, so the prerendered shell of /library is 12 skeleton blocks and no content (checked in .next/server/app/en/library.html). Valid, but equivalent to the existing loading.tsx. Making the shell meaningful needs a product call on the sidebar_state cookie (server-read) and what stays per-request.
- L6: T3 auth routes. sign-up, [...rest] and games/[id]/play pass without the opt-out. sign-in reads only ?error= from searchParams: wrapped in Suspense with the plain AuthPage as fallback, so the page is in the shell and the error replaces it. two-factor keeps `instant = false` with a reason: its getSession() is a redirect guard and inside Suspense redirect() would stop being a real 307. Needs the user's confirmation.
