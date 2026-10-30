/**
 * The shortest gap between two refreshes that a window event may cause.
 *
 * Returning to a tab fires `focus` and `visibilitychange` together, and
 * flicking between windows fires them again within seconds. The balance cannot
 * have moved that fast without this tab seeing it (a turn announces itself),
 * so a refresh inside the gap only repeats a Polar call.
 */
export const FOCUS_REFRESH_MIN_GAP_MS = 30_000

/**
 * Whether a focus or visibility event should refetch the balance.
 *
 * Only those events are throttled: the post-turn reconcile and the slow poll
 * exist to catch changes the tab could not see, so they always run.
 */
export function shouldRefreshOnFocus(
  now: number,
  lastRefreshAt: number,
  minGapMs: number = FOCUS_REFRESH_MIN_GAP_MS
): boolean {
  return now - lastRefreshAt >= minGapMs
}
