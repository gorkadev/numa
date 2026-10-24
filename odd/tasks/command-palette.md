# Command palette as a toolbar

Objective: turn the ⌘K palette from a title search into a toolbar that also runs actions (phase 1: wire existing actions, better grouping, nested pages).
Branch: `feat/command-palette` (from `master` after PR #9). Delivery: `ask-on-risk`, one commit per task; forecast ~500 authored lines. Runner: `pnpm --dir apps/web exec tsx --test <file>`; checks `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web lint`.

## Specs

Scope approved by the user ("Boff increíble, justo lo q necesitaba y estaba pensando si. Vamos con eso primero") over the assistant's proposal: blocks 1 and 2 without message search, plus the nested pages of block 3. The quoted bullets below are that proposal, verbatim.

- **S1** Current game actions. "**Sobre la partida actual**, cuando estás dentro de `/games/[id]`: fijar/desfijar, renombrar y borrar. Son las mismas server actions del `GameMenu` (`setGamePinned`, `renameGame`, `deleteGame`)."
- **S2** Navigation. "**Navegación**: Precios, Perfil y abrir Ajustes directamente en una sección (Seguridad, Facturación, Atajos…), porque `lib/settings/sections.ts` ya las tiene definidas."
- **S3** Preferences. "**Preferencias**: cambiar de tema (claro, oscuro o sistema) y de idioma sin abrir Ajustes."
- **S4** New game from a template. "**Nueva partida desde plantilla**: un subnivel que lista las plantillas del `TemplatePicker`."
- **S5** Grouping. "**Agrupar los resultados**: Partida actual, Fijadas, Recientes, Acciones, Ajustes."
- **S6** Live state. "**Estado en vivo** en cada resultado: loader si el agente está trabajando y punto azul si tiene algo sin leer. `GameActivityProvider` ya tiene esos datos."
- **S7** Nested pages. "**Páginas anidadas**: eliges «Cambiar modelo» y aparece la lista de modelos; eliges «Tema» y aparecen las opciones. `cmdk` lo soporta con un stack de páginas y Backspace para volver." Assumption: «Cambiar modelo» is out of phase 1, since the model tier lives in the composer's state, not in a setting; Theme, Language and Templates are the nested pages.
- Phase 2, started on "despues, continua con lo siguiente" (L5); the quoted bullets are the assistant's earlier proposal, verbatim:
- **S8** Shortcut hints. "Atajos visibles en cada ítem, leídos de `keyboard-shortcuts.ts`."
- **S9** Prefixes. "`>` para ver solo comandos, `#` para ver solo partidas."
- **S10** Quick prompt. "**Pregunta rápida**: lo que escribes en el palette se convierte en el primer mensaje de una partida nueva («Crear partida: “juego de serpientes”»)."
- **S11** Message search. "**Buscar dentro de los mensajes** de los chats, no solo en los títulos. Esto ya requiere un endpoint con búsqueda en Postgres (full-text o `ILIKE`), así que es la pieza más cara."

## Tasks

- [x] T1 · S1 S5 · current game group with pin/unpin, rename and delete; rename/delete dialogs shared with `GameMenu`. Route: inline. Commit f41326c.
- [x] T2 · S2 · navigation: Pricing, Profile, Settings sections via `useSettingsDialog`. Route: inline. Commit 536693f.
- [x] T3 · S3 S7 · page stack (Backspace on empty input goes back); Theme and Language pages. Route: inline. Commit bc5af0b.
- [x] T4 · S4 S7 · Templates page; `/?template=<id>` preselects the composer's template. Route: inline. Commit 9fd6779.
- [x] T5 · S5 S6 · Pinned/Recents split and spinner/dot per row. Route: inline. Commit e0f840b.
- [x] T6 · S8 · shortcut hints from `SHORTCUT_GROUPS`, one shared key formatter for the settings section and the palette. Route: inline. Commit: see L6.
- [x] T7 · S9 · `>` commands only, `#` games only; prefix stripped before cmdk's `defaultFilter`. Route: inline. Commit: see L6.
- [x] T8 · S10 · "Create game: …" item that submits the typed text through `createGame`. Route: inline. Commit: see L6.
- [x] T9 · S11 · owner-scoped message search server action, debounced, "Messages" group. Route: inline. Commit: see L6.

## Log

- L1 (2026-10-24) User: "El buscador de la sidebar, el de command + k, es muy simple ahora mismo. Simplemente es un buscador sobre títulos de chats. Me gustaría potenciarlos haciéndolo una barra de herramientas donde puedas no solo buscar sino ejecutar distintas cosas y demás. Que se te ocurre q podemos hacer?" Then, on the proposal: "Boff increíble, justo lo q necesitaba y estaba pensando si. Vamos con eso primero".
- L2 Findings: palette in `components/command-palette.tsx`, opened from `AppSidebar` (⌘K). `GameMenu` holds pin/rename/delete with its dialogs inline. Settings open through `useSettingsDialog().openSettings(section)` (URL `?settings=`). Theme via `next-themes`, locale via `setLocalePreference` + `router.refresh()` (`LocaleSwitcher`). Template is local state in `NewGameComposer` (`DEFAULT_TEMPLATE_ID`). `useGameWorking`/`useGameUnread` give per-game live state; the open game id is parsed by `OPEN_GAME` in `game-activity-provider.tsx`.
- L3 (2026-10-24) T1-T5 done inline, one commit each. Evidence: RED then GREEN for `openGameIdOf` (activity tests 21/21), `backFrom` (3/3), `templateFromQuery` (2/2); the rest is wiring with no meaningful unit RED (no component test harness). Suite 184/184 (one earlier run had 1 failure that passed in two reruns: the known flaky `message-meta.test.ts`); tsc clean; eslint clean on touched files. Shared code reused instead of copied: `GameActionDialogs` (out of `GameMenu`), `useChangeLocale` + `LOCALE_OPTIONS` (out of `LocaleSwitcher`), `SECTION_LABEL_KEYS` (moved to `lib/settings/sections.ts`), `openGameIdOf` (out of the activity provider). NOT observed in the browser (the dev server redirects to sign-in; needs the user). Branch ~700 authored lines over master, above the 400 heuristic; delivered as one PR like `feat/game-activity` unless the user asks for a split.
- L4 (2026-10-24) Independent verifier (Risk item 3, shared code): S1-S7 met, no blockers; typecheck clean, suite 184/184; every next-intl key present in en and es. Shared refactors match master behavior. Advisory fixed in 798a394: ⌘K closed the palette without resetting the page stack, so it reopened on the last page; the reset now keys on the `open` prop. Accepted edge: picking the same template again from the palette after changing it by hand keeps the manual pick (the URL does not change). The `viewing` locale concern is void: `i18n/routing.ts` sets `localePrefix: "never"`. Browser check still pending (user).
- L5 (2026-10-24) User, with screenshots of the Theme and Language pages: "hay un par de fallos, y esq no se ve correctamente esto. despues, continua con lo siguiente". Cause: `CommandItem` (packages/ui) already renders a tick at the row end for `data-checked` rows and keeps a hidden one at `ml-auto` on every row, so the palette's own tick and the spinner/dot sat mid-row. Fixed in 0dbacab (`data-checked`, state in `CommandShortcut`). "Lo siguiente" read as phase 2 (S8-S11).
