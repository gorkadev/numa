# Game Files Tab

Objective: a read-only Files tab in the chat side panel that maps the game's sandbox directory, with a file tree on the left and a file viewer on the right.
Branch: `feat/game-files`. Delivery: ask-on-risk. Tests: `pnpm --dir apps/web exec tsx --test <files>`, plus `pnpm --filter web typecheck` and `lint`.

## Specs

- S1 — "un file tree y visualizador de archivos en el panel lateral del chat". The tree maps "esa carpeta del sandbox de cada juego donde se guardan los archivos, tanto los nuestros como el propio juego q crea el agente", i.e. everything under `GAME_DIR` (`/home/daytona/game`).
- S2 — "de primeras yo lo haría solo lectura". There is no way to create, edit, rename or delete files.
- S3 — The tree follows the shadcn File Tree pattern (https://ui.shadcn.com/docs/ai-elements/base/file-tree.md): a folder is a Collapsible and a file is a ghost Button.
- S4 — Text files are shown with the existing highlighter and `CodeBlock` ("el highlighter de @packages/ui/src/components/code-block.tsx").
- S5 — Assets can be viewed ("es posible visualizar los assets?"): images, audio and video render natively from the preview proxy. SVG is shown only as `<img>`. Other binaries show their name and size. 3D models (`.glb`/`.gltf`) are deferred to a later phase.
- S6 — Layout: "un nuevo tab en el panel lateral derecho, junto a agents y preview, con el file tree a la izquierda y el archivo a visualizar a la derecha, siguiendo el patron del tab de agents".
- S7 — Opening the tab resumes an archived sandbox, "como la preview" (through `startGameServer`), and shows a loading state while it starts.
- S8 — Access is limited to the game's owner. Paths cannot leave `GAME_DIR`, and a game with no sandbox is never provisioned by the viewer.
- Assumption: desktop side panel only in this phase. On mobile the panel stays preview-only, as it is today.
- Assumption: the tree and the open file refresh when the game's revision changes (after a turn writes files). There is no polling.

## Tasks

| ID | Specs | Route | Status | Commit |
| -- | ----- | ----- | ------ | ------ |
| T1 | S1, S5 | inline | done | 39a32fe |
| T2 | S1, S2, S7, S8 | inline | done, verified | c50edb8, 2bf0969 |
| T3 | S2-S7 | inline | done | bf70d58 |

- T1: pure helpers in `lib/games/files.ts` — nest a flat listing into a sorted tree, and classify a path into code (with a highlighter language), image, audio, video or binary.
- T2: owner-scoped route handlers `GET /api/games/[id]/files` (tree) and `GET /api/games/[id]/files/content?path=` (text content), with size cap and binary detection. Risk item 2 (auth/access control).
- T3: Files tab UI (tree, viewer, side panel wiring, i18n, refresh on revision).

Route evidence: no writer trigger (one sequential feature, no parallel units, parent context well under the backstop).

## Log

- L1 (2026-10-27, user, verbatim): "hay una cosa q no tenemos q creo q seria guay tambien: un file tree y visualizador de archivos en el panel lateral del chat / podemmos mapear esa carpeta del sandbox de cada juego donde se guardan los archivos, tanto los nuestros como el propio juego q crea el agente / de primeras yo lo haría solo lectura, que te parece? usaria este pattern de shadcn para construir el file tree: https://ui.shadcn.com/docs/ai-elements/base/file-tree.md / para visualizar el archivo, podriamos usar el highlighter de @packages/ui/src/components/code-block.tsx? o como lo hariamos? y es posible visualizar los assets? o q necesitariamos para ello? / a nivel de diseño, la idea es un nuevo tab en el panel lateral derecho, junto a agents y preview, con el file tree a la izquierda y el archivo a visualizar a la derecha, siguiendo el patron del tab de agents"
- L2 (2026-10-27, user, verbatim, answering whether opening the tab may resume an archived sandbox): "si, como la preview. vamos con ello"
- L3: Exploration. Files live in the Daytona sandbox under `GAME_DIR`; the agent tools read them with `sandbox.fs.listFiles`/`downloadFile` (`lib/games/tools.ts`). The preview proxy serves the same directory through `python3 -m http.server` behind a signed token, so asset URLs reuse it. `getGameSandbox` provisions a sandbox when none exists, so the viewer uses `startGameServer(game.sandboxId)` instead. Collapsible and Button already exist in `@workspace/ui`; no new dependency.
- L4 (2026-10-27): T1 RED (module missing) then GREEN 6/6. T2 RED then GREEN; `GAME_DIR` and `resolveGamePath` moved to the dependency-free `lib/games/game-path.ts` (re-exported from the old homes) so the route logic is testable without Neon env. T3 RED for tree, viewer and tab, then GREEN. Full web suite 359/359, typecheck and lint clean.
- L5 (2026-10-27): Browser check on a real game ("Toon Base Survival"): tree loads after a ~15 s cold start, code highlights, the verify screenshot renders via the preview proxy, and the preview still plays. A real-browser probe found `downloadFile` failing inside Next route handlers: the Daytona SDK `require`s `busboy` dynamically and the bundle cannot resolve it. Fixed with `serverExternalPackages: ["@daytona/sdk"]` (2bf0969, risk item 5). The endpoint then answered 200 for a file, `directory` for a folder, 400 for `../x`, 404 for a missing file and 404 for another game's id. A Base UI warning (`defaultOpen` changing after mount) was fixed by reading it once per folder.
- L6: RDD is off for this clone (clone-local), so there is no native review. Independent verifier launched for risk items 2 and 5.
- L7 (2026-10-27): Independent verifier: S1-S8 pass, no blockers. It ran tsc (clean), the suite (359/359), eslint (only the pre-existing turbo warning) and path probes against `resolveGamePath` (traversal, absolute, encoded and empty paths all rejected). Advisories, accepted for now: (1) files whose names have characters outside `[A-Za-z0-9._-]` show in the tree but return 400 as text, though media still loads through the proxy; (2) dotfiles inside `GAME_DIR` are readable, owner-only, and the proxy already serves them; (3) route errors become 503 without logging; (4) pre-existing turbo env warning. Follow-up: removed the unused `resolveGamePath` re-export from `tools.ts` and its stale comment. Verifier scratch removed.
- Next: push and open a PR when the user decides. Out of scope for now: mobile Files view and the 3D model viewer.
