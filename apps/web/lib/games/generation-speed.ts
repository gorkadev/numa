/**
 * How fast the orchestrator generates, as the two numbers a rate is made of.
 *
 * Kept as tokens and milliseconds rather than a ready-made rate: a session's
 * speed is its total output over its total generation time, and an average of
 * per-step rates would weigh a two-token step the same as a two-thousand-token
 * one. This module is imported by the browser, so it must not reach the model
 * registry (see `context-usage.ts`).
 */
export type GenerationSpeed = {
  tokens: number
  ms: number
}

/** The slice of the AI SDK's `StepResultPerformance` a reading needs. */
type StepTiming = {
  responseTimeMs: number
  timeToFirstOutputMs: number | undefined
}

/**
 * The reading for one finished step, or `null` when there is nothing honest to
 * measure: no output, no streaming first-chunk time, or no time after it.
 *
 * Time is measured from the first generated chunk, not from the request: the
 * wait before it is the provider reading the prompt, which is a latency figure
 * of its own (time to first token), not generation speed.
 */
export function speedOfStep(
  outputTokens: number | undefined,
  timing: StepTiming
): GenerationSpeed | null {
  if (!outputTokens || outputTokens <= 0) return null

  if (timing.timeToFirstOutputMs === undefined) return null

  const ms = timing.responseTimeMs - timing.timeToFirstOutputMs

  if (!(ms > 0)) return null

  return { tokens: outputTokens, ms }
}

export function addSpeed(
  a: GenerationSpeed,
  b: GenerationSpeed
): GenerationSpeed {
  return { tokens: a.tokens + b.tokens, ms: a.ms + b.ms }
}

export function tokensPerSecond(speed: GenerationSpeed): number {
  return speed.ms > 0 ? speed.tokens / (speed.ms / 1000) : 0
}
