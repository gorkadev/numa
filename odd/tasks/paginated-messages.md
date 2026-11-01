# Paginated chat messages

Objective: store each game's thread as rows and load it in pages, keeping the existing games.
Branch: `feat/paginated-messages`. Delivery strategy: `ask-on-risk`.
Test runner: in `apps/web`, `pnpm exec tsx --test $(find . -name "*.test.ts*" -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./.trigger/*")`.

## Specs

- S1 Paginate the chat, following shadcn Message Scroller "Loading Earlier Messages" (https://ui.shadcn.com/docs/components/base/message-scroller.md): stable `messageId`, `preserveScrollOnPrepend`.
- S2 Messages move out of `games.messages` into their own table.
- S3 "a poder ser, intentemos preservarlos, ns si podriamos con alguna migracion o similar hacerlo": existing threads are copied, not lost.
- S4 Assumption: session totals in the usage footer keep covering the whole thread.
- S5 Assumption: the agent still receives the full history on every turn.
- S6 Earlier messages load on scroll: "sin boton, lo cargamos haciendo scroll".
- S7 The outline paints every turn: "en el outline pintamos todos, sabiendo de manera sencilla el total q hay". Hover must not issue a request (L10).
- S8 "no tiene sentido q no puedas ver todos los subagentes si no has hecho scroll en el chat": every run is listed from the first render, stored apart from the thread.
- S9 "si un juego no esta ejecutandose, esq no va a cambiar NUNCA, cacheamos y no hacemos peticion. si entro a un juego, cargo hasta arriba todos los mensajes, me voy a otro, a otro, vuelvo a estos dos... no hacemos peticion de nuevo": TanStack Query caches thread data, invalidated when a turn finishes.
- S10 "hacer un equilibrio entre traer la informacion necesaria en base a lo q el usuario ve": heavy tool outputs load on demand, after checking what each render needs.
- S11 "no pensar solo en base a los juegos q tenemos ahora [...] pensar siempre q es lo mejor y lo recomendado en hacer, q pasaria si tenemos un chat con muchisimos subagentes, muchiismo texto/interacciones... ponerse siempre en el extremo de los casos": every read and write stays bounded on an extreme thread, whatever today's data shows.

## Tasks

- [x] T1 (S2, S5) inline — `game_messages` table, `thread.ts` read and write. Commit: 8324ca2.
- [x] T2 (S3) inline — apply schema with `db:push`, backfill production, verify counts. Evidence: L5.
- [x] T3 (S1, S4) inline — page reads, server action, chat hook and load control. Commits: 8324ca2, 12f45e5. Evidence: L8.
- [ ] T4 (S2, S3) inline — drop `games.messages`. Blocked: needs the user's go-ahead, irreversible.
- [x] T5 (S8) inline — `game_subagent_runs`, written with the thread, backfilled. Commit: this slice.
- [x] T6 (S9) delegated — TanStack Query for thread data, invalidated by the activity signal. Evidence: L17. Commit: pending.
- [x] T7 (S6, S7, S8) delegated — scroll loading, full outline, full subagent list with lazy detail. Evidence: L17. Commit: pending.
- [x] T9 (S11) delegated — bounded reads and saves per L15. Agent history is out of scope until the compaction decision (L16). Evidence: L17. Commit: pending.
- [ ] T8 (S10) inline — heavy tool outputs on demand. Commit: pending.

Route evidence: T1-T5 inline, no Writer trigger. T6, T7, T9 delegated to one bounded writer under the long-session backstop (context), as one coupled unit. Risk: item 1 (persisted format, existing data), independent verifier required.

## Log

- L1 (2026-11-01, user): "okey, perfecto. igualmente, considero q paginar si debemos de hacerlo tarde o temprano, asiq vamos a hacerlo ya. https://ui.shadcn.com/docs/components/base/message-scroller.md te adjunto la docu de shadcn de message scroller, en la seccion Loading Earlier Messages. antes de q preguntes: me la sudan los juegos q tenemos hasta ahora, pero a poder ser, intentemos preservarlos, ns si podriamos con alguna migracion o similar hacerlo"
- L2 Design: `(game_id, position)` primary key, so a save stays an array rewrite and needs no unique message ids; `position` is the page cursor. Pages start on a user message, five turns each, so a page boundary never splits a grouped run. The SDK sends one message per record and `hydrateMessages` rebuilds history from the database, so a client holding only the tail is safe.
- L3 Known narrowing: the thread outline, the sub-agent panel and the task strip cover loaded messages only. The footer totals read metadata-only skeletons of older assistant messages.
- L4 Backfill SQL (DML, idempotent; `db:push` creates the table first):
  `insert into game_messages (game_id, position, role, message) select g.id, e.ordinality - 1, e.value->>'role', e.value from games g, jsonb_array_elements(g.messages) with ordinality e on conflict (game_id, position) do update set role = excluded.role, message = excluded.message`
- L5 Backfill on production 2026-11-01: 27/27 threads rebuilt from `game_messages` equal `games.messages`, 134/134 rows. Typecheck OK, suite 522/522. RED seen on `thread-page.test.ts` (module missing). RDD is off for this clone (clone_local).
- L6 Verifier blocker: the load control as first `MessageScrollerItem` stopped `preserveScrollOnPrepend` (primitive detects a prepend by the old first child index > 0). Moved outside `MessageScroller`. Also retired anchors of messages sent from this mount on load, and tie-broke the search snippet by position.
- L7 Verifier: S2-S5 pass; S1 blocker rechecked PASS on 12f45e5 in headless Chrome on a harness of the primitive, not the real app. Accepted advisory: when the last page removes the control, the scroller grows 40px, so the row shifts by that height once. Deploy note: re-run the backfill just before any deploy, while nothing has written through the new code.
- L8 Real app, game with 19 turns: 10 of 38 rows on open, footer "19 turns" before loading. Three loads, 10->20->30->38 rows, visible row delta 0 on each, including the last page; 38 unique rows, control gone at the end, no console errors captured after the load. A real agent turn through the new save was not run because it spends credits; `saveGameThread` was exercised on the temporary Neon branch.
- L9 (2026-11-02, user): "okey me parece si. esq piensa 2 cosas: primero tenemos q intentar, en la medida de lo posible, hacer un equilibrio entre traer la informacion necesaria en base a lo q el usuario ve, y segundo, cachear; si un juego no esta ejecutandose, esq no va a cambiar NUNCA, cacheamos y no hacemos peticion. si entro a un juego, cargo hasta arriba todos los mensajes, me voy a otro, a otro, vuelvo a estos dos... no hacemos peticion de nuevo, para que? ahi encaja perfecto tanstack query yo creo"
- L10 Evidence: a 5-turn tail averages 149 kB against 154 kB full; dispatch tools 2.0 MB, read_file 1.5 MB, text 0.2 MB of 4.15 MB; user messages 27 kB for 69 rows. So outline data travels in the first load and hover issues no request.
- L11 S9 premise checked: only `saveGameThread` writes the thread, called from two turn hooks in `trigger/chat.ts`, and the agent clears `working` after the save. The `games` row does change between turns (title, pin, read state, sandbox, token), so only thread data is cached.
- L12 (2026-11-02, user): "y no pensar solo en base a los juegos q tenemos ahora, q tambien, pero pensar siempre q es lo mejor y lo recomendado en hacer, q pasaria si tenemos un chat con muchisimos subagentes, muchiismo texto/interacciones... ponerse siempre en el extremo de los casos para poder abarcar las maximas cosas posibles"
- L13 Linear costs found against S11: `saveGameThread` sends every row on each save, and one insert is capped at 65535 bind parameters (about 16k messages at four per row); `readEarlierStats` grows with the thread; a page counted in turns has no byte ceiling; a first-load outline grows with turns, which supersedes the first-load decision in L10; the subagent list has no bound; the agent still loads the whole thread each turn.
- L14 Backfill through `saveSubagentRuns`: 123 runs in 22 games on production. List projection without `timeline`, `toolCalls`, `prompt`, `summary` is 53 kB against 612 kB full.
- L15 Design for T6, T7, T9:
  - Cache key `["thread", gameId, lastTurnFinishedAt]`, with `staleTime` and `gcTime` infinite. `lastTurnFinishedAt` arrives with the game row on every navigation, so a finished turn changes the key from any tab or device and needs no realtime delivery. While `useGameWorking(gameId)` is true the cached thread is never reused: fetch fresh. Only thread data is cached, per L11.
  - `page.tsx` stops reading the thread and keeps reading the game row. `ChatThread` mounts only once the first page exists, so a cache hit mounts synchronously with every page previously loaded and `useChat`'s initial state stays correct.
  - GET route handlers, each resolving ownership through `getGame`, not server actions, which Next runs one at a time: thread page, outline page, subagent list page, one subagent record.
  - Pages hold 1 to 5 turns and stop at about 256 kB, never splitting a turn. A `size` column on `game_messages`, written by `threadRows`, avoids reading bodies to measure. A single turn over the ceiling is accepted until T8.
  - Outline: fetched after first paint, in pages of 200 turns, each `{ id, position, text }` with text cut in SQL to about 160 chars. Clicking an unloaded turn loads up to its position, then `scrollToMessage`. No request on hover.
  - Subagents: list pages of 100 from `record - timeline - toolCalls - prompt - summary`, loaded by scrolling the list; a run's full record on open; live stream records merged over the list by `agentId`.
  - Session totals: `games.session_stats` jsonb computed in `saveGameThread` from the messages it holds, in a form that can be added to. The footer shows stored totals plus messages sent from this mount. `readEarlierStats` goes away.
  - Save: skip rows already stored. Read `position, md5(message::text)`, write the changed rows in chunks under the bind parameter limit.
  - Scroll loading: no in-flow control; an overlaid spinner outside `MessageScrollerContent`, triggered near the top of the viewport; keep loading while the viewport cannot scroll and earlier pages remain. Failure shows the existing localized message with a retry.
- L16 Open: `chat.agent` has no `compaction` configured, so an extreme thread exceeds the model's context long before any database limit. Summaries cost model tokens, so this waits for the user's decision.
- L17 T6, T7, T9 implemented per L15. `db:push` applied `game_messages.size` and `games.session_stats` with no prompt; `games.messages` kept. Backfill on production 2026-11-02: 27 games, 134 rows confirmed before; digest of every row equal after, 0 rows with size 0, 0 games without stats. Deviation from L15's letter: `md5(message::text)` hashes jsonb's own text, so the app hashes `jsonbText`, a jsonb-canonical serializer; it matched Postgres on 134/134 rows, and a miss only rewrites a row. Additions to L15: a cached empty thread is never reused (a first prompt may be landing); turn finish and send also evict the game's inactive queries, covering back navigation to an old key and failed turns; the agents tab count shows `+` while pages remain. RED seen on `thread-page.test.ts` and `session-usage.test.ts` (missing exports). Typecheck OK, suite 551/551. Real app, 19-turn game: all pages loaded on scroll, 38 unique rows, delta 0, 19 marks, footer "19 turns" with 10 rows; two other games and back: 0 thread requests, 38 rows; hover 0 requests; clicking the oldest unloaded turn loaded 2 pages and landed on it; 21 runs listed with 2 rows loaded; a listed run fetched its record once, reopen cached; missing game 404, bad cursor 400; no console errors. Not run: a real turn through the new save (credits), so `saveGameThread` was exercised only on unchanged threads, and the brand-new `initialPrompt` path in the browser. Advisories: `game_subagent_runs` has no `(game_id, position)` index, so a list page sorts that game's rows; the rail renders one element per turn on every scroll tick; the agents filter applies to loaded runs.
