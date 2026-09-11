# Spike: concurrent Gemini-on-Vertex calls from `ToolLoopAgent`s

Gate for `agent-harness` task 4.0. Run on 2026-09-11 from a local dev machine.

## Verdict

**Works, no serialization needed at the design's cap of 3.** Keep the cap at 3.
Going above it did not fail, but it produced a long tail stall, so the cap and
the per-role timeout are both load-bearing.

## Setup

- `@ai-sdk/google-vertex` 5.x, `ai` 7.0.x, model `gemini-3.5-flash-lite`
  (the `light` slot, the cheapest entry in the registry).
- One `ToolLoopAgent` per run, built like `run-subagent.ts`: one `add` tool,
  `stopWhen: stepCountIs(3)`, `maxRetries: 0` (so a 429 would surface instead
  of being retried away), `.stream()` fully consumed, `timeout: 60_000`.
- Each run is two model calls: step 1 emits the tool call, step 2 answers.
- Concurrent scenarios start every run at once with `Promise.all`.

## Results

| Scenario | Run | Wall time | Per-run time | Errors |
|---|---|---|---|---|
| Sequential, 3 runs | 1 | 4.3 s | 1.3–1.8 s | 0 |
| Concurrent, 3 runs (design cap) | 1 | 1.6 s | 1.3–1.6 s | 0 |
| Concurrent, 3 runs (design cap) | 2 | 1.7 s | 1.7 s | 0 |
| Concurrent, 6 runs (2× cap) | 1 | 35.3 s | 1.1–1.6 s, one at 35.3 s | 0 |
| Concurrent, 6 runs (2× cap) | 2 | 27.1 s | 1.1–1.5 s, one at 27.1 s | 0 |

All 24 runs returned the correct answer with one tool call and two steps.
No 429, no 5xx, no abort.

In the second 6-run batch, per-step timing showed the stall is in **step 2**
(the call after the tool result): step 1 finished at 0.9 s and step 2 at
27.1 s. The other five runs finished both steps in under 1.6 s.

## Findings

1. Concurrency at 3 is a real speed-up: the same three runs took 1.6 s
   concurrently against 4.3 s sequentially.
2. Vertex did not reject concurrent requests. Pressure above the cap showed up
   as latency on one request, not as an error, so the fallback chain
   (`fallback-model.ts`) would never see it.
3. The stall reproduced in both 6-run batches, so it is not a one-off. The
   cause is unknown: server-side queueing is plausible, but this spike cannot
   tell it apart from other causes.
4. A stalled call still finishes. It only costs wall time, which the per-role
   timeout and the turn deadline in `run-subagent.ts` already bound.

## Consequences for unit 4.1

- Keep the pool cap at 3 and the batch limit at 4, as designed. No
  serialization fallback is needed.
- A stalled worker delays its batch's `Promise.all`-style wait. The per-role
  timeout is what keeps one slow call from holding the whole turn, so it must
  stay in force for `run_tasks` workers.

## Limits

- Only `gemini-3.5-flash-lite` was tested. The `mid` and `strong` models
  (`gemini-3.8-flash`, `gemini-3.1-pro-preview`) may have different quota and
  latency behavior under concurrency.
- Runs came from one local process, not a Trigger.dev worker, and prompts were
  tiny. Real workers send larger contexts and run more steps.
- Two batches per scenario is a small sample.
