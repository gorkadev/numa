type Timers = {
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

/**
 * Runs `fn` at most once per `intervalMs`: at once when the interval has
 * passed, otherwise once more at its end, however many calls arrived in
 * between. `cancel` is final — once a turn's receipt is written, a late
 * provisional one must never follow it.
 */
export function createThrottle(
  fn: () => void,
  intervalMs: number,
  {
    now = Date.now,
    setTimer = (callback, ms) => setTimeout(callback, ms),
    clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  }: Timers = {}
): { call: () => void; cancel: () => void } {
  let lastRun = Number.NEGATIVE_INFINITY
  let pending: unknown
  let cancelled = false

  const run = () => {
    pending = undefined
    lastRun = now()
    fn()
  }

  return {
    call() {
      if (cancelled || pending !== undefined) return
      const wait = lastRun + intervalMs - now()
      if (wait <= 0) run()
      else pending = setTimer(run, wait)
    },
    cancel() {
      cancelled = true
      if (pending !== undefined) clearTimer(pending)
      pending = undefined
    },
  }
}
