/**
 * Where the orchestrator's time went, summed over steps.
 *
 * Totals rather than ready-made averages, so a session is the sum of its
 * turns and an average is taken once at the end. Browser-safe: it must not
 * reach the model registry (see `context-usage.ts`).
 */
export type StepTimingTotals = {
  /** Time spent waiting on the model, request to end of response. */
  llmMs: number
  /** Time spent inside tool calls. Parallel calls add up, so this is work, not wall time. */
  toolMs: number
  /** Sum of the waits before the first generated chunk, over steps that streamed one. */
  ttftMs: number
  /** How many steps contributed to `ttftMs`. */
  ttftSteps: number
}

/** The slice of the AI SDK's `StepResultPerformance` a reading needs. */
type StepPerformance = {
  responseTimeMs: number
  timeToFirstOutputMs: number | undefined
  toolExecutionMs: Readonly<Record<string, number>>
}

export function timingOfStep(performance: StepPerformance): StepTimingTotals {
  const hasTtft = performance.timeToFirstOutputMs !== undefined

  return {
    llmMs: performance.responseTimeMs,
    toolMs: Object.values(performance.toolExecutionMs).reduce(
      (sum, ms) => sum + ms,
      0
    ),
    ttftMs: performance.timeToFirstOutputMs ?? 0,
    ttftSteps: hasTtft ? 1 : 0,
  }
}

export function addTiming(
  a: StepTimingTotals,
  b: StepTimingTotals
): StepTimingTotals {
  return {
    llmMs: a.llmMs + b.llmMs,
    toolMs: a.toolMs + b.toolMs,
    ttftMs: a.ttftMs + b.ttftMs,
    ttftSteps: a.ttftSteps + b.ttftSteps,
  }
}

/** Mean wait before the first chunk, or `null` when no step streamed one. */
export function averageTtft(timing: StepTimingTotals): number | null {
  return timing.ttftSteps > 0 ? timing.ttftMs / timing.ttftSteps : null
}

/**
 * `1.2s` under a minute, `3m 4s` beyond it. Whole seconds from ten seconds up,
 * one decimal below, where tenths still tell two short waits apart.
 */
export function formatDuration(ms: number, locale: string): string {
  const seconds = Math.max(ms, 0) / 1000

  const number = (value: number, digits: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
      value
    )

  if (seconds < 60) return `${number(seconds, seconds < 10 ? 1 : 0)}s`

  const whole = Math.round(seconds)

  return `${Math.floor(whole / 60)}m ${whole % 60}s`
}
