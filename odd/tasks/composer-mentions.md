# Composer File Mentions

Objective: mention game files with `@` in the game chat composer, shown as chips that open the file in the side panel.
Branch: `feat/composer-mentions`. Delivery: ask-on-risk. Tests: `tsx --test <files>` from `apps/web` (global tsx), plus `pnpm --filter web typecheck` and `lint`.

## Specs

- S1 — "poder hacer @ y adjuntar archivos en el chat composer, dentro del chat de un juego claro". Typing `@` opens a list of the game's files, filtered as you type ("conforme escribes te salen los archivos y seleccionas y asi el agente sabrá de q archivo hablas"). Example: "Usa @gun como el arma principal del personaje".
- S2 — The agent receives the mentioned file's full path in the message text (`@<path>`); no backend change.
- S3 — "no me gusta q solo se muestren x resultados sin scroll ni mostrar todos: si busco gltf, solo me muestra unos cuantos, deberia de mostrarme todos y yo poder hacer scroll dentro de la lista. la lista al tener scroll, debe de tener fade arriba y abajo".
- S4 — "la lista se abre siempre encima del composer, debe de abrirse encima del @ y no tiene pq ocupar todo el ancho del composer" — over the `@` on whatever line it was typed, independent of the composer's width.
- S5 — "al seleccionar ese archivo, en vez de ponerse con toda la ruta y un @ ... se ponga en plan resaltado, como hacen claude o chatgpt" — a chip showing the file name. Implemented with Tiptap ("vamos con tiptap sin problemas si"), keeping `InputGroup` with the editor in place of `InputGroupTextarea`.
- S6 — "al clicar, se abre el panel lateral y el archivo clicado" — clicking a mention chip opens the side panel on the Files tab with that file selected.
- Assumption: S6 applies to chips in sent messages; chips inside the composer being edited are not clickable links.
- Assumption: the composer keeps exposing plain text (`@<path>` per chip), so dictation, the prompt improver, drafts and sending keep working on strings.

## Tasks

| ID | Specs | Route | Status | Commit |
| -- | ----- | ----- | ------ | ------ |
| T1 | S1-S4 | inline | done (textarea version) | cf59d0e |
| T2 | S1, S2, S5 | inline | done, browser-checked — Tiptap editor + chips in the composer | ffc267e |
| T3 | S6 | inline | done; click-to-open not exercised live (needs a sent message) | see log |

## Log

- L1 (2026-10-27) — "vamos ahora a hacer una cosa interesante: poder hacer @ y adjuntar archivos en el chat composer, dentro del chat de un juego claro. como podriamos hacer esto? mi idea esq pongas @ y te salga un popovercontent o similar con algunas sugerencias o algo y conforme escribes te salen los archivos y seleccionas y asi el agente sabrá de q archivo hablas / "Usa @gun como el arma principal del personaje"... algo asi sabes? / dificultad de esto?"
- L2 — "vale si, vamos poco a poco": plain-text version first (full path inserted). Built and browser-checked.
- L3 — user asked for chips (S5), click-to-open (S6), all results with scroll + fade (S3), list over the `@` (S4). S3/S4 built and browser-checked (75 gltf results, list over a third-line `@`).
- L4 — "vamos con tiptap sin problemas si"; tree approved: `InputGroup` > editor (`data-slot="input-group-control"`) + addon; mention list stays in the composer's React tree, anchored at Tiptap's `clientRect`.
- L5 — T2: Tiptap 3.32.0 (document, paragraph, text, mention, suggestion, extensions). Editor keeps a plain-text contract (`lib/games/mention-doc.ts`). Enter keymap needed priority 100.5 (between Mention 101 and core keymap 100): at 50, core split the paragraph. Browser: chip shown as file name, Enter/Tab choose, Shift+Enter new line, empty Enter sends nothing, Backspace removes chip whole. Not exercised live: outside writes (dictation/improver/clear after send) — covered by `textToDoc` round-trip tests only. Risk: item 5 (new dependencies).
- L6 — T3: `splitMentions` treats `@x` as a file only when it ends in an extension (no listing in the thread). User bubble renders `MentionText` chips (primary-foreground pill on the primary bubble). `game-chat` `openFile` sends a `{path, nonce}` request; `SidePanel` adopts it during render and keys `FileTree` on the nonce so collapsed folders reveal the file. Static render tests only; a real click needs a sent message, which runs the agent and costs credits, so it was left to the user.
- L7 — Independent verifier: S1–S6 PASS, no blockers; typecheck clean, 382/382 tests, eslint 0 errors. Advisories: (1) a restored draft shows `@path` as text, not chips (initial doc built with no known paths); (2) a mention followed by punctuation (`@gun.glb.`) stays text; (3) CRLF leaves `\r` in text nodes, harmless; (7) `onOpenFile` stability — checked: `openFile` is a `useCallback` with no deps.
