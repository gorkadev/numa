# Chat compaction

Objective: keep the game chat orchestrator inside its context window by summarizing the thread, automatically at 80% and on demand with `/compact`.
Branch: `feat/chat-compaction`. Delivery strategy: `ask-on-risk`.
Test runner: in `apps/web`, `pnpm exec tsx --test $(find . -name "*.test.ts*" -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./.trigger/*")`.

## Specs

- S1 "usariamos 80% como umbral para hacerlo automaticamente": the orchestrator's context is compacted automatically once it reaches 80% of its model's context window.
- S2 "tendremos entonces que usar un nuevo shortcut, al igual q el @, para hacer acciones: \"/\"": typing `/` in the composer opens an actions menu, like `@` does for files.
- S3 `/compact` is the first action: it compacts the conversation on demand.
- S4 The summary is written by Gemini 3.8 Flash and "Por supuesto se paga con créditos claro": its cost is charged in credits.
- S5 Assumption (from paginated-messages S3): the stored thread stays complete; compaction changes what the agent receives, not what the player sees.

## Tasks

- [x] T1 (S1, S4, S5) — persisted compaction marker, model messages from the latest marker, automatic compaction at 80%, billed. Route: inline (no Writer trigger). Evidence: L5.
- [ ] T2 (S2, S3, S4) — `/` actions menu in the composer, `/compact` action on the agent, marker rendered in the thread. Route: inline (no Writer trigger).

## Log

- L1 (2026-11-02, user): "Vamos a hacer t10" — T10 of `odd/tasks/paginated-messages.md`, L18: "lo guardamos (como t10 o el q toque) para hacer proximamente. usariamos 80% como umbral para hacerlo automaticamente, y tendremos entonces que usar un nuevo shortcut, al igual q el @, para hacer acciones: \"/\"."
- L2 Finding: `hydrateMessages` rebuilds the model messages from the stored thread on every turn (`@trigger.dev/sdk` `dist/esm/v3/ai.js` around 4628), so the SDK's built-in `compaction` result would be lost by the next turn. Compaction must be persisted by the app.
- L3 (2026-11-02, user), on the summary model: "Es así como lo hacen Claude o códex? Cogen todo y lo mandan a un modelo para que hagan un resumen? Que consideras mejor, q lo haga flash lite 3.5 o flash 3.8? Q precio sería aprox? Por supuesto se paga con créditos claro". Estimate at 840k input and 10k output tokens with `CREDIT_MARKUP` 2: Lite about 55 credits, Flash about 133. Recommended Flash 3.8; user: "De acuerdo si".
- L4 Design: a compaction appends an assistant marker `{ parts: [{ type: "data-compaction", data: { summary, trigger, tokens, window } }] }` to the stored thread. `run` sends the latest summary, opening the first user message after the marker, plus the messages after it; `ai`'s `convertToModelMessages` drops the marker itself (checked). A later compaction summarizes the previous summary plus its tail, so no request ever needs the whole thread. Auto compaction runs in `onBeforeTurnComplete` after a finished turn whose last orchestrator reading is at least 80% of the window, before pricing, so the live receipt and the ledger include it; the marker joins `onTurnComplete`'s save. Summary model: utility task `compact` on `flash-medium`. Attachments become a note naming the file in the summary request. Out of scope: compacting mid-turn, between orchestrator steps.
- L5 T1: RED seen on `lib/games/compaction.test.ts` (module missing), then 11/11. Suite 612/612, typecheck and eslint clean. Not run: a real auto compaction (needs about 840k tokens of context); the manual action in T2 exercises the same summary path cheaply.
