# Chat usage footer

Objective: a usage footer under the game chat composer showing session tokens, cache hit, context used and session statistics.
Branch: `feat/chat-usage-footer`. Delivery: `ask-on-risk`, one commit per task. Runner: `pnpm --dir apps/web exec tsx --test <file>` (plain `node --test` cannot resolve the extensionless imports).

## Specs

Reference screenshots (DeepSeek Harness, user-supplied 2026-10-24) are the visual target, built with shadcn primitives from `packages/ui`.

- **S1** Footer under the composer, one line, three groups, copied from the reference: `3 turns 5 steps · 322 tok/s`, `40.6K tok · Cache hit 0%`, and a ring with `2%`.
- **S2** Token group popover, titled `Token usage` with the session total, rows `Cache hit`, `Uncached input`, `Cached input`, `Output`. Session totals, not last turn.
- **S3** Token arithmetic (verified in code): cached is a SUBSET of input (`lib/ai/pricing.ts`). Total = input + output. `Uncached input` = input − cached. `Cache hit` = cached / input. The per-message receipt (`Turn usage`) is untouched.
- **S4** Context group (P2): popover `2% of context used` with `~16.7K / 1M`. Numerator = the orchestrator's LAST step `inputTokens`, never the summed input. Denominator = the window of the model that served the turn, declared in `model-registry.ts` as `contextWindow` (required field, 1,048,576 for all three models).
- **S5** Statistics group (P3): popover `Session statistics` with `LLM time`, `Tool time`, `Avg time to first token (TTFT)`, `Tokens per second (TPS)`; steps and turns need new capture.
- **S6** The footer is an opt-in slot on `ChatComposer` (it is shared with the new-game screen, which must not change). Labels localized en/es.
- **S7** Not building: the `System prompt` / `Tool definitions` / `Messages` breakdown (provider reports only the total, so it would be estimation). Assumption: confirm with the user before P2 closes.

Assumptions (not user-confirmed): the token group shows SESSION totals as in the reference, summed client-side from message metadata (`readMessageMeta`, written per turn by `withTurnMeta`, same source as the ledger), so P1 needs no server code or `turn_usage` query. Flash and Lite windows are third-party sourced; verify against Vertex docs.

## Tasks

- [x] T1 · S2 S3 · inline · pure `sumSessionUsage(messages)` + tests · RED observed (module not found), GREEN 5/5, pricing 3/3, tsc clean · Risk: none · commit: feat(chat) session usage helper
- [x] T2 · S1 S2 S6 · inline · `UsageFooter` token group (Popover), opt-in `usageSlot` on `ChatComposer`, wired in `chat-thread.tsx`, `ChatUsage` en/es labels · tsc, eslint, prettier clean · Risk: none · PENDING: visual check in the browser (Chrome extension was not connected) · commit: feat(chat) usage footer
- [x] T3a · S4 · inline · `contextWindow` required on `ModelEntry` (1,048,576 per Gemini model) + `entryContextWindow(id)`; test pins all 7 entries; the required field already caught one stale fixture in `models.test.ts` · tsc clean, registry/models/fallback/pricing/catalog tests green · Risk: none
- [ ] T3b · S4 · inline · server capture: `lib/games/context-usage.ts` (transient `data-context-usage` chunk + reader, tests), `turnState` last-step context guarded by turn like `ledgerFor`, `onStepFinish` on the orchestrator `streamText`, durable copy on message metadata (optional `context`, so reload keeps the ring) · Risk to check: turn pipeline next to pricing; must not touch `turnState.addUsage`
- [ ] T3c · S4 · inline · client: `onData` + latest message metadata → `ContextRing` (SVG ring + Popover with `Progress`, `~16.7K / 1M`), en/es
- [ ] T4 · S5 · pending P3 · timing instrumentation (`onStepFinish`/`onChunk`), turns and steps

## Log

- L1 (2026-10-24) User: "recupera de engram donde nos hemos quedado aqui, tema de telemetria, contexto, etc... creo q son los topics 509,510 y 483 [...] lo continuamos contigo, echale un vistazo y me dices donde estamos y como seguimos. necesitas ui? dudas?"
- L2 User: "tienes por cierto en engram o en odd los links y conocimiento sobre los ai elements de shadcn?" and supplied five reference screenshots for the UI.
- L3 User: "pero la ventana de contexto depende del modelo no? no podemos poner la q nosotros queramos, o si?" then "pues creo q los 3 tienen 1m, puedes mirarlo en internet". Web check: 1,048,576 for all three (official page for Argon only).
- L4 User: "bien si, vamos empezando" (P1 first, context ring in P2).
- L5 Finding: P1 needs no DB read; message metadata already holds per-turn tokens and the client has every message.
