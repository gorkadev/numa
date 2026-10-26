# Game Settings

Objective: per-user game preferences in Settings › Game (default tier, session statistics in the footer), the new-game view's tier and template kept in the URL, and a persistent new-game draft in sessionStorage.
Branch: `feat/game-settings`. Delivery: ask-on-risk (one PR to master, user merges via agent as before). Test runner: `pnpm --dir apps/web exec tsx --test <file>`.

## Specs

- S1 — Default tier. User: "al crear un nuevo juego, q tier quieres q se te seleccione por defecto, en vez de siempre balanced". Decision (L2): `user_settings.default_tier_id` nullable, null = the app default (`DEFAULT_TIER_ID`); the settings selector offers the three tiers only, null shown as the app default selected. The new-game composer starts on: `?tier=` if valid, else the preference, else `DEFAULT_TIER_ID`.
- S2 — Session statistics. User: "si quieres mostrar o no en el footer el trigger + popover del tema de de los tokens segundo, turns y steps y estadisticas de sesion". A `user_settings.show_session_stats` switch, default on, hides only `SessionStatistics` in `usage-footer.tsx`; token usage and the context ring stay.
- S3 — Tier in the URL. User: "si elijo otro, q se guarde en la url sabes, igual q se hace ahora con la template". Changing the tier on the new-game view writes `?tier=` with `router.replace`.
- S4 — Template in the URL. User: "solo se guarda en la url desde el command palette, pero si lo clico directamente no". Picking a template on the new-game view writes `?template=` the same way.
- S5 — New-game draft. User: "en vez de borrarse nada mas pasarse del palette al input se borra al enviarse ... no puedes tener varias, unicamente tienes 1 ... si vas al command palette y escribes "asdf" y le das a "open in composer..." se sobreescribe si tuvieras algo ... recargo la vista? texto autocompletado con "hola" -> lo recupera. me voy a otra pagina, vuelvo... se recupera y mantiene". One sessionStorage entry, written as the player types, restored on mount, overwritten by the palette's "Open in composer" (which no longer puts the prompt in the URL), cleared on submit and written back if creating the game fails.

## Tasks

- [x] T1 — S1, S2 — inline — `default_tier_id` (nullable) + `show_session_stats` (default true), `db:push` applied with no data-loss prompt; `updateGameSettings(patch)` replaces `setImproverOverageBilling`; Settings › Game rows (RED module missing; GREEN 3/3)
- [ ] T2 — S1, S3, S4 — inline — new-game composer initial tier and URL sync
- [ ] T3 — S2 — inline — footer hides session statistics
- [ ] T4 — S5 — inline — new-game draft store, composer and palette wiring

## Log

- L1 (2026-10-26, user, verbatim): "genial! eso es, esas dos cosas eran. vamos a hacer las dos si: al crear un nuevo juego, q tier quieres q se te seleccione por defecto, en vez de siempre balanced. q es mejor, q por defecto en bbdd tengan el valor a null o en balanced? y en el nuevo selector de ajustes q metamos, q ponemos, los tres tiers o los tres tiers + opcion de default/predeterminado (q por debajo es balanced). creo q las dos cosas van unidas para hacerlo de una manera u otra / despues, la otra opcion seria si quieres mostrar o no en el footer el trigger + popover del tema de de los tokens segundo, turns y steps y estadisticas de sesion, sabes no?"
- L2 (user, verbatim): "perfecto si" — to: null in the DB, three tiers in the selector, footer switch default on.
- L3 (user, verbatim): "ademas, otra mejora chula: imagina q tienes por defecto el tier de pro. abres una nueva sesion y por defecto se te selecciona pro. si elijo otro, q se guarde en la url sabes, igual q se hace ahora con la template (q por cierto, solo se guarda en la url desde el command palette, pero si lo clico directamente no) / el prompt, ahora mismo desde el command palette tambien puedes escribir y se pasa a la vista de nuevo juego y popula el input. pero si es muy largo, no es malo q se guarde el prompt entero en la url? una mejor opcion? podemos hacerlo en local o session storage? o daria problemas? o es rizar demasiado el rizo?"
- L4 (user, verbatim): "y si ese prompt borrador en vez de borrarse nada mas pasarse del palette al input se borra al enviarse? de este modo, no solo preservas el prompt si lo creas desde el palette, sino q en la vista normal de new game, si escribes y sin llegar a enviar recargas, se guarda. [...] obviamente, si vas al command palette y escribes "asdf" y le das a "open in composer..." se sobreescribe si tuvieras algo [...] recargo la vista? texto autocompletado con "hola" -> lo recupera. me voy a otra pagina, vuelvo... se recupera y mantiene." Decision: sessionStorage (per tab); a same-tab event tells an already mounted composer; read after mount to avoid a hydration mismatch.
