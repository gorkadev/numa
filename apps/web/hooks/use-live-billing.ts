"use client"

import { useCallback, useEffect, useState } from "react"

import { onTurnCredits } from "@/lib/polar/credits-channel"
import type { BillingSummary } from "@/lib/polar/plan"

/**
 * How long to wait after a turn before asking Polar what the balance really
 * is.
 *
 * Polar's meter is eventually consistent and the observed lag is four to ten
 * seconds — the measurement is recorded on `getCreditBalance` in
 * `lib/polar/balance.ts`. Refetching at the top of that window would overwrite
 * a correct optimistic number with the pre-turn balance, which is the exact
 * flicker this whole mechanism exists to avoid, so the wait sits past the far
 * end of it. Being late costs nothing here: the displayed number is already
 * right, and this call only confirms it.
 */
const RECONCILE_DELAY_MS = 12_000

/**
 * How often an idle, visible tab re-reads the balance.
 *
 * Two minutes, and the interval is the SAFETY NET rather than the mechanism.
 * The number moves for one reason — a turn — and a turn announces itself, so
 * polling exists only to catch what this tab could not see: a turn taken in
 * another tab, a top-up bought on the pricing page, the monthly grant landing.
 * None of those are worth a fast poll, and every one of them is a Polar call
 * multiplied by every open tab of every user.
 */
const POLL_INTERVAL_MS = 120_000

/**
 * The billing summary the chrome renders, kept current without a navigation.
 *
 * # Why the server value is a seed and not the truth
 *
 * The layout reads the summary during render, so it is correct at first paint
 * and frozen from then on — the sidebar lives above the page content and does
 * not re-render when a turn finishes inside it. Before this hook, a user
 * watched a build consume credits and saw the same number all session, until
 * a full reload. The seed is still what draws first (no spinner, no flash),
 * and this takes over afterwards.
 *
 * # The three ways it updates, in order of how much they matter
 *
 * 1. A finished turn publishes what it spent and the balance drops
 *    immediately. This is the one the user actually perceives, because it is
 *    the only update that happens while they are looking at the number.
 * 2. That optimistic subtraction is reconciled against Polar once its meter
 *    has caught up. It corrects the drift that accumulates from rounding, from
 *    turns taken in other tabs, and from anything that spent credits without
 *    passing through this tab at all.
 * 3. Regaining focus refetches, and a visible tab polls slowly. Between them
 *    they cover every change this tab had no way to observe.
 *
 * # Why the optimistic value is allowed to be wrong
 *
 * Because it is wrong in a bounded, harmless direction. `turnCreditsChunk`
 * carries the same figure the ledger bills, so the arithmetic matches; what
 * can drift is the starting point, and the reconcile fixes it seconds later.
 * Nothing is gated on this number — the credit gate lives in the run, reading
 * Polar directly (`trigger/chat.ts`) — so an optimistic display can refuse
 * nobody and grant nobody anything.
 *
 * # `null` still means unknown
 *
 * Every `null` balance is passed through untouched, and none is ever turned
 * into a number: subtracting from an unknown balance would invent a
 * confident-looking figure out of an admission of ignorance. See the note on
 * `BillingSummary` for what that costs a paying customer.
 */
export function useLiveBilling(seed: BillingSummary): BillingSummary {
  const [billing, setBilling] = useState(seed)

  /**
   * A later render from the server wins.
   *
   * The layout re-runs on navigation between pages, so its summary can be
   * newer than anything this hook has fetched — and it is authoritative when
   * it arrives. Comparing the seed's fields rather than its identity is what
   * keeps this from resetting the balance on every render: the layout builds a
   * fresh object each time, so an identity check would fight the optimistic
   * update it is meant to defer to.
   *
   * State rather than a ref, which is React's own shape for adjusting state
   * when a prop changes: setting during render restarts this render before
   * anything is committed, so no extra pass is painted and no effect fires
   * with the stale value in between.
   */
  const [previousSeed, setPreviousSeed] = useState(seed)

  if (
    previousSeed.plan !== seed.plan ||
    previousSeed.balance !== seed.balance
  ) {
    setPreviousSeed(seed)
    setBilling(seed)
  }

  /**
   * Reads the authoritative summary, and survives being wrong about it.
   *
   * A failed fetch — offline, a Polar outage, a sign-out mid-flight — leaves
   * the displayed number exactly where it was rather than blanking it. The
   * number on screen is the last thing known to be true, and a dash would
   * claim less than that.
   */
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/billing/summary", {
        cache: "no-store",
        signal,
      })

      if (!response.ok) return

      setBilling((await response.json()) as BillingSummary)
    } catch {
      /* Keep whatever is on screen. */
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    /**
     * One timer, replaced rather than stacked. A user who sends three turns in
     * quick succession should produce one reconcile after the last of them,
     * not three overlapping fetches racing to write the same state.
     */
    let reconcile: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = onTurnCredits((credits) => {
      setBilling((current) =>
        current.balance === null
          ? current
          : { ...current, balance: current.balance - credits }
      )

      clearTimeout(reconcile)
      reconcile = setTimeout(
        () => void refresh(controller.signal),
        RECONCILE_DELAY_MS
      )
    })

    /**
     * Focus and visibility are two different events for two different
     * gestures — alt-tabbing back to the window, and returning to this tab
     * from another one — and only the second is filtered, because a hidden
     * document firing `visibilitychange` is a tab being LEFT.
     */
    const onFocus = () => void refresh(controller.signal)
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)

    /**
     * The poll skips hidden tabs rather than pausing on them: a background tab
     * has nobody reading its sidebar, and whatever it missed is fetched the
     * moment it comes back. Browsers throttle background timers anyway, so the
     * check mostly documents the intent — but it also means twenty forgotten
     * tabs cost Polar nothing.
     */
    const poll = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh(controller.signal)
    }, POLL_INTERVAL_MS)

    return () => {
      unsubscribe()
      clearTimeout(reconcile)
      clearInterval(poll)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
      controller.abort()
    }
  }, [refresh])

  return billing
}
