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

- [ ] T1 · spike · verify in dev: `metadata.set` and a `user:<id>` tag from the `chat.agent` lifecycle hooks, what initial state `subscribeToRunsWithTag` delivers on subscribe (docs do not say), token scope and refresh. No sidebar, no DB.
- [ ] T2 · S3 S4 S6 · schema + hooks: the two `games` columns (`pnpm db:push`), written from `onTurnComplete` and when a game is opened.
- [ ] T3 · S1 S2 S3 · provider + subscription + `GameRow` loading/hover swap.
- [ ] T4 · S4 · unread indicator and mark-as-read.
- [ ] T5 · S5 · toasts on the same store (own task, later).

## Log

- L1 (2026-10-24) User: "podemos hacer que mientras un agente esta trabajando, en la sidebar mostrar un loading? ... se muestre un icono de loading junto al icono de tres puntos de acciones q hay ahora, el cual unicamente es visible al hacer hover" and "desde la sidebar como actualizamos ese estado? pues con un efecto no? o no serviria? intentaria pensarlo en hacerlo lo mas performance posible".
- L2 Findings: the run stays `executing` while idle between messages, so run status alone is not "working"; a turn-level flag is needed. Trigger docs (SDK 4.5.16, `docs/realtime`): `useRealtimeRunsWithTag`, run metadata updates are pushed, tokens can be scoped by tag. Asked the user whether to start with the spike (T1); no answer yet.
