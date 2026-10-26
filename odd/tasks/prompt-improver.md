# Prompt Improver

Objective: a composer button that rewrites the player's text into a solid game prompt, grounded in the selected template; free within a per-plan daily quota, optionally charged at cost beyond it; plus a "Game" settings section backed by a new `user_settings` table.
Branch: `feat/prompt-improver`. Delivery: ask-on-risk, forecast ~900 authored lines, chain strategy cached as `stacked-to-main` (user: "me da igual"). Test runner: `pnpm --dir apps/web exec tsx --test <file>`.

## Specs

- S1 — "un botón en el chat composer q actúe de improver... No es un improver genérico, necesitamos q sea un improver q, en base a lo escrito por el usuario y el template seleccionado si lo hubiera, genere un prompt en condiciones". Button in the shared composer (home and game thread). It rewrites the composer text in place, grounded in the selected template's catalog (descriptor + model inventory) when one is selected; it keeps the player's language and scope (no features nobody asked for), fixes controls, HUD and win/lose. In a game thread it improves a change request, not a new-game prompt. The original text can be restored (undo). Model: `lite-medium` as a utility task.
- S2 — "Free - no puede usar el improver / Pro - 10 al día / Max - 20 al dia". Quota per UTC day, counted on the server from a ledger of improvements. Unknown plan (Polar unreachable) → unavailable, never free and never blocked as Free.
- S3 — "q se sepa en todo momento cuál es ese límite ... mediante un tooltip o similar". The button's tooltip states remaining uses ("quedan N de M hoy"); exhausted → disabled with when it resets; Free → disabled with "available on Pro"; charged mode → says it is charged in credits by usage.
- S4 — "una nueva sección ... para ajustes del juego ... una opción para cobrar o no en créditos los improvers, de manera q quien quiera usarlo siempre aún cuando se le agoten q pueda hacerlo pero q se le cobre". New "Game" settings section with that toggle, stored in a new per-user `user_settings` table (typed columns; later: default tier, hide tok/s). Default off.
- S5 — "Q cueste lo q tenga q costar ... Igual q cuesta el agente mientras codea". Beyond the quota with the toggle on, an improvement is priced exactly like a turn (`turnCreditCost`, same markup and rounding) and metered to Polar under `game_turn` with its own dedupe key; it needs a positive balance before it runs. Titles stay free (L4).

## Tasks

- [x] T1 — S2, S4, S5 — inline — `user_settings` + `prompt_improvements` tables, `db:push` applied (no runnable RED: schema) — f582835
- [x] T2 — S2, S3 — inline — pure quota/allowance module (RED module missing; GREEN 7/7) — b01d3e8
- [x] T3 — S1 — inline — instructions + compact template context, no paths (RED module missing; GREEN 4/4) — b897bd2
- [x] T4 — S1, S2, S5 — inline — `readImproverAllowance`, `improvePrompt`, `ingestImprovementCredits`, utility task `improve` = lite-medium; change mode no longer assigns models to existing roles (RED/GREEN 6/6) — dbb867a. Action wiring has no unit test (DB + Polar); live call checked.
- [x] T5 — S1, S3 — inline — button + tooltip (`improverTooltip`, RED/GREEN 8/8) + undo; `focusableWhenDisabled` keeps the tooltip on a disabled button — e435563, fe1fd03 (actions loaded on first use so the composer test renders without the DB)
- [x] T6 — S4 — inline — `?settings=game` section, `setImproverOverageBilling` upsert (RED/GREEN 1/1) — 6121269

## Log

- L1 (2026-10-25, user, verbatim): "Varias veces te he venido a decir oye pásame un prompt para mandar / Porque no hacemos un botón en el chat composer q actúe de improver? No es un improver genérico, necesitamos q sea un improver q, en base a lo escrito por el usuario y el template seleccionado si lo hubiera, genere un prompt en condiciones"
- L2 (user, verbatim): "Free - no puede usar el improver / Pro - 10 al día / Max - 20 al dia / Y en ajustes, una nueva sección vamos a a hacer para ajustes del juego por así decirlo, y vamos a meter una opción para cobrar o no en créditos los improvers, de manera q quien quiera usarlo siempre aún cuando se le agoten q pueda hacerlo pero q se le cobre"
- L3 (user, verbatim): "Mmm y sino decimos nada yya? Q cueste lo q tenga q costar, me explico? Igual q cuesta el agente mientras codea sabes / Y si, habrá q crear una nueva tabla en bd para esto. Yo le llamaría settings." Decision: table named `user_settings`; theme and locale stay per device (`next-themes` localStorage, locale cookie), not moved.
- L4: Titles are free (`generateTitle`, `lite-minimal`, no Polar event); kept free. Estimated improver cost ~$0.0035 per call (~5k in, ~800 out on Lite).
- L5: Live checks (Max account, dev): tooltip "Improve prompt · 20 of 20 left today"; improve on Toon rewrote the text in Spanish naming catalog models, undo restored the original; ledger row lite-medium 729 in / 1142 out, 3074 µ$, 0 credits; settings toggle persisted true then false in `user_settings`. Two real calls via a local script: new mode 5.8 s / 3397 µ$, change mode 3.9 s / 2112 µ$. Context sizes: toon 1518 chars (74 models), cube-world 4237 (107), fantasy-cards 458 (34), all ids present.
- L6: Closing checks T1-T6 — suite 310/310, tsc clean, eslint 0 errors. Not run live: a charged improvement (Polar ingest) and the exhausted/locked states, which would charge real credits or need fake ledger rows; covered by unit tests of `improverAllowance`/`improverTooltip`. Risk: item 1 (charges credits through Polar) → independent verifier at feature end. RDD off (clone-local).
