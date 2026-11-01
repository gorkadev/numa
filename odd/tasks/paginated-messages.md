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

## Tasks

- [x] T1 (S2, S5) inline — `game_messages` table, `thread.ts` read and write. Commit: this slice.
- [x] T2 (S3) inline — apply schema with `db:push`, backfill production, verify counts. Evidence: L5.
- [x] T3 (S1, S4) inline — page reads, server action, chat hook and load control. Commit: this slice. Browser check pending.
- [ ] T4 (S2, S3) inline — drop `games.messages`. Blocked: needs the user's go-ahead, irreversible.

Route evidence: no Writer trigger; one behaviour with coupled surfaces, so the parent writes inline. Risk: item 1 (persisted format, existing data), independent verifier required.

## Log

- L1 (2026-11-01, user): "okey, perfecto. igualmente, considero q paginar si debemos de hacerlo tarde o temprano, asiq vamos a hacerlo ya. https://ui.shadcn.com/docs/components/base/message-scroller.md te adjunto la docu de shadcn de message scroller, en la seccion Loading Earlier Messages. antes de q preguntes: me la sudan los juegos q tenemos hasta ahora, pero a poder ser, intentemos preservarlos, ns si podriamos con alguna migracion o similar hacerlo"
- L2 Design: `(game_id, position)` primary key, so a save stays an array rewrite and needs no unique message ids; `position` is the page cursor. Pages start on a user message, five turns each, so a page boundary never splits a grouped run. The SDK sends one message per record and `hydrateMessages` rebuilds history from the database, so a client holding only the tail is safe.
- L3 Known narrowing: the thread outline and the sub-agent panel cover loaded messages only. The footer totals read metadata-only skeletons of older assistant messages.
- L4 Backfill SQL (DML, idempotent; `db:push` creates the table first):
  `insert into game_messages (game_id, position, role, message) select g.id, e.ordinality - 1, e.value->>'role', e.value from games g, jsonb_array_elements(g.messages) with ordinality e on conflict (game_id, position) do update set role = excluded.role, message = excluded.message`
- L5 Backfill on production 2026-11-01: 27/27 threads rebuilt from `game_messages` equal `games.messages`, 134/134 rows. Typecheck OK, suite 522/522. RED seen on `thread-page.test.ts` (module missing). RDD is off for this clone (clone_local).
