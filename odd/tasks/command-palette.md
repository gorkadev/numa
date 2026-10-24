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
- Out of scope (phase 2): message search, `>`/`#` prefixes, quick prompt, shortcut hints.

## Tasks

- [ ] T1 · S1 S5 · current game group with pin/unpin, rename and delete; rename/delete dialogs shared with `GameMenu`. Route: inline.
- [ ] T2 · S2 · navigation: Pricing, Profile, Settings sections via `useSettingsDialog`. Route: inline.
- [ ] T3 · S3 S7 · page stack (Backspace on empty input goes back); Theme and Language pages. Route: inline.
- [ ] T4 · S4 S7 · Templates page; `/?template=<id>` preselects the composer's template. Route: inline.
- [ ] T5 · S5 S6 · Pinned/Recents split and spinner/dot per row. Route: inline.

## Log

- L1 (2026-10-24) User: "El buscador de la sidebar, el de command + k, es muy simple ahora mismo. Simplemente es un buscador sobre títulos de chats. Me gustaría potenciarlos haciéndolo una barra de herramientas donde puedas no solo buscar sino ejecutar distintas cosas y demás. Que se te ocurre q podemos hacer?" Then, on the proposal: "Boff increíble, justo lo q necesitaba y estaba pensando si. Vamos con eso primero".
- L2 Findings: palette in `components/command-palette.tsx`, opened from `AppSidebar` (⌘K). `GameMenu` holds pin/rename/delete with its dialogs inline. Settings open through `useSettingsDialog().openSettings(section)` (URL `?settings=`). Theme via `next-themes`, locale via `setLocalePreference` + `router.refresh()` (`LocaleSwitcher`). Template is local state in `NewGameComposer` (`DEFAULT_TEMPLATE_ID`). `useGameWorking`/`useGameUnread` give per-game live state; the open game id is parsed by `OPEN_GAME` in `game-activity-provider.tsx`.
