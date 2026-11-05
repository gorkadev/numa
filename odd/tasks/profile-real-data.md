# Profile with real data

Objective: replace the profile's example data with the user's real activity and let them set a username.
Branch: feat/profile-real-data (from master). Delivery: ask-on-risk. Tests: `pnpm exec tsx --test <files>` (CI runs every `*.test.ts*`), plus `pnpm --filter web typecheck`.

## Specs

- S1 Real activity. "popular de verdad el profile". Data comes from `turn_usage` (turns, credits, tokens per turn, `user_id`, `created_at`) and `games`. No example data and no "Datos de ejemplo" labels remain.
- S2 Metric. "guardaria turnos y/o creditos, no tokens, q igual se la pela a un user normal. aunq podemos tambien mostrarlo o permitir configurarlo desde ajustes". The default metric is turns; credits and tokens are selectable in Settings.
- S3 Username. "poder configurar el username (desde ajustes, cn el resto de opciones)". Editable in Settings > Profile, next to the name; validated by the Better Auth `username` plugin already on the server. Shown as `@username` on the profile.
- S4 Integrations. "integraciones no tiene snetido eso es, asiq lo sustituimos por lo q comentas". Remove the integrations counter and card; replace them with the most-worked games (by turns) and a current streak.
- S5 Heatmap window. "queda mal q siempre veas el año entero ... mejor q los ultimos dias esten al final, ... y q sea un año hacia atras". A rolling window ending today, as on GitHub, not Jan 1 to Dec 31.
- S6 The rest as proposed: no daily/weekly/cumulative toggle; statistics show active days, daily average, peak day, and longest streak; the Edit button opens Settings > Profile; days are the viewer's local days, not UTC.

## Tasks

- T1 S1, S4, S5, S6: activity query, day binning in the viewer's time zone, statistics, profile UI. Route: inline. Status: done.
- T2 S2: `user_settings.profile_activity_metric` and its Settings row. Route: inline. Status: done.
- T3 S3: username row in Settings > Profile. Route: inline. Status: done.

## Log

- L1 (2026-11-06) User, verbatim: "si estoy de acuerdo con lo q comentas, guardaria turnos y/o creditos, no tokens, q igual se la pela a un user normal. aunq podemos tambien mostrarlo o permitir configurarlo desde ajustes. username lo tenemos puesto ya pero no se le da uso y desde la ui no se le permite desde ningun lado ponerlo ni nada creo, asiq pensamos tambien en eso: poder configurar el username (desde ajustes, cn el resto de opciones). integraciones no tiene snetido eso es, asiq lo sustituimos por lo q comentas / el heatmap, un cambio q quiero viendo el de github: queda mal q siempre veas el año entero, pq a no ser q estes en diciembre, siempre vas a ver parte vacio. mejor q los ultimos dias esten al final, ns si me explico, y q sea un año hacia atras por asi decirlo, me explico? / todo lo demas lo dicho, lo q comentas"
- L2 Design: the server returns hourly UTC buckets of the last 371 days (sparse, only hours with activity); the browser bins them into local days, so no time zone has to be stored. The heatmap's `toKey` keys cells by UTC ISO date while the grid uses local midnights, which shifts a day in UTC+ zones; it switches to local dates.
- L3 Evidence (2026-11-06): RED then GREEN for the heatmap day shift (Europe/Madrid showed Mar 10 as 0), activity binning and streaks (7 tests), the metric setting (game-preferences tests) and username rules (3 tests). Full suite from apps/web: 653/653. Typecheck and lint clean. `pnpm db:push` added `user_settings.profile_activity_metric`. In the running app: real numbers (67 turns, 14 active days, top games), rolling Nov-to-Nov window, invalid username rejected inline, metric switched to credits and back with the profile repainting behind the dialog, no console errors on reload. A valid username was not saved, to avoid changing the owner's account.
- L4 Decisions: the metric lives in Settings > Account (not a toggle on the profile); the daily/weekly/cumulative toggle is gone; tokens are input plus output; top games are all-time and leave out deleted games.
