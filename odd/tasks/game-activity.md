# Game activity in the sidebar

Objective: show in the sidebar which games have an agent working, and which finished with something unread; the same signal later feeds in-app toasts.
Branch: to be created from `feat/chat-usage-footer` or master after it merges. Delivery: `ask-on-risk`, one commit per task. Runner: `pnpm --dir apps/web exec tsx --test <file>`. Schema changes: `pnpm db:push` only (see AGENTS.md).

## Specs

- **S1** While a game's turn is running, its sidebar row shows a loading icon in the slot of the three-dots action. "mientras este trabajando (en termino general, q el orquestador mismo este en ello, esperando la respuesta de un subagente, lanzando un subagente... todo eso cuenta como pendiente)".
- **S2** On hover the loading disappears and the three dots show again. "al hacer hover, entonces el loading desaparece y se muestra el icono de los tres puntos de nuevo".
- **S3** The state survives leaving the chat and reloading the window. "sales del chat y sigues viendo q ese agente del chat sigue trabajando ... sobrevive a salirse del propio chat, recargar la ventana".
- **S4** When the agent finishes, the loading goes away and a blue indicator shows "tienes cosas pendiente q leer, ha terminado".
- **S5** Built from the root for future in-app toasts: one signal for the sidebar and the toasts. "hay q construirlo y pensarlo bien de raiz".
- **S6** Performance: avoid needless database calls. "lo mas performance posible, para no llamar innecesariamente a bbdd".

## Design agreed in principle (NOT started, assumptions to verify)

1. WORKING (volatile): Trigger Realtime. Chat runs already carry the tag `chat:<gameId>`; add `user:<id>`; the run does `metadata.set("working", true/false)` in `onTurnStart` / `onTurnComplete`; ONE `useRealtimeRunsWithTag("user:<id>")` subscription per tab in the layout, with a public token scoped to that tag minted server-side, `skipColumns` for payload/output. A dead run goes terminal, so the loading clears itself.
2. UNREAD (durable): two columns on `games`, `last_turn_finished_at` (written in the same UPDATE `onTurnComplete` already does for the thread) and `last_read_at` (written once when the game is opened). Unread = finished > read. Both ride on `listGames()`, which the layout already runs: no extra read.
3. One store/provider in the layout (`working` and `unread` per game, `useSyncExternalStore` selectors so only the changed row re-renders). Toasts read the same store.
4. Why not polling an effect: every tab would query the DB on a timer even when nothing changes. Why not a client-only event (like the credits channel): it dies when the chat unmounts, which is exactly the case the indicator exists for.

## Tasks

- [x] T1 · spike · verify in dev: `metadata.set` and a `user:<id>` tag from the `chat.agent` lifecycle hooks, what initial state `subscribeToRunsWithTag` delivers on subscribe (docs do not say), token scope and refresh. No sidebar, no DB. Route: inline. Evidence: L4. Spike code reverted, nothing committed but this log.
- [x] T2 · S3 S4 S6 · schema + hooks: the two `games` columns (`pnpm db:push`), written from `onTurnComplete` and when a game is opened. Route: inline. Evidence: L5.
- [ ] T3 · S1 S2 S3 · provider + subscription + `GameRow` loading/hover swap.
- [ ] T4 · S4 · unread indicator and mark-as-read.
- [ ] T5 · S5 · toasts on the same store (own task, later).

## Log

- L1 (2026-10-24) User: "podemos hacer que mientras un agente esta trabajando, en la sidebar mostrar un loading? ... se muestre un icono de loading junto al icono de tres puntos de acciones q hay ahora, el cual unicamente es visible al hacer hover" and "desde la sidebar como actualizamos ese estado? pues con un efecto no? o no serviria? intentaria pensarlo en hacerlo lo mas performance posible".
- L2 Findings: the run stays `executing` while idle between messages, so run status alone is not "working"; a turn-level flag is needed. Trigger docs (SDK 4.5.16, `docs/realtime`): `useRealtimeRunsWithTag`, run metadata updates are pushed, tokens can be scoped by tag. Asked the user whether to start with the spike (T1); no answer yet.
- L3 (2026-10-24) User: "empiezo por la tarea T1, el spike de metadata y suscripción por etiqueta en Trigger."
- L4 (2026-10-24) T1 results, observed in dev with temporary instrumentation (reverted):
  - Tag: `startGameChatSession` passing `triggerConfig: { ...params.triggerConfig, tags: ["user:<id>"] }` to `start()` yields runs tagged `["chat:<gameId>", "user:<id>"]` (SDK `ai-shared.js` `chatRunTags` prepends `chat:`, max 10 tags, 128 chars). Only sessions created after the change get it: existing games have no `user:` tag. Not observed: whether continuation runs (after idle timeout) keep the tag; by reading, tags live in the session's stored `triggerConfig`; confirm in T3.
  - Metadata: `metadata.set("working", true)` in `onTurnStart` and `false` in `onTurnComplete` both arrive pushed. Sequence: QUEUED, EXECUTING, ~6 s later `working: true`, ~13 s later `working: false`, run stays EXECUTING (idle). Each change arrives 2-3 times (the SDK also writes its own metadata keys), so consumers must dedupe on the `working` value.
  - Initial state: on subscribe the server delivers EVERY run ever carrying the tag, terminal ones included (`chat:dcbbf363…` returned 4 runs, 3 CANCELED, in ~196 ms). For `user:<id>` that is the whole history per tab load, so T3 must pass `createdAt` (duration string, max `"1w"`, computed server side at subscribe). Open: a turn in a run created before that window would be missed.
  - Token: `auth.createPublicToken({ scopes: { read: { tags: ["user:<id>"] } } })` subscribes fine. A token scoped to another tag gets NO error: the stream closes silently after ~1.3 s. Refresh not exercised (token `expirationTime` set; re-mint on expiry belongs to T3).
  - Confirmed L2: a run from 03:10 was still EXECUTING while idle; status alone is not "working".
- L5 (2026-10-24) User: "perfecto, continua". T2 done on branch `feat/game-activity` (from `feat/chat-usage-footer`). `games.last_turn_finished_at` / `last_read_at` (nullable timestamptz, pushed and confirmed in `information_schema`). Both use the DB `now()` (worker and Next server clocks differ). `saveGameThread({ turnFinished: true })` stamps the finish in the same UPDATE, only from `onTurnComplete` (stopped and failed turns count as finished). The game page calls `markGameRead` only when `isGameUnread(game)` on the row it already loaded, so opening a game with nothing new writes nothing (S6); the UPDATE repeats the check in SQL and scopes to the owner. RED (module missing) then GREEN 4/4 for `isGameUnread`; suite 161/161; tsc and eslint clean. No runnable test for the two DB writes (no DB test harness); end-to-end check falls to T3/T4.
  - Note for T4: the player watching the chat while a turn ends would see their own open game marked unread; the open chat must mark read on turn end.
  - Noted, out of scope: `listGames` loads full rows, `messages` jsonb included, for the sidebar.
