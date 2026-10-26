import type { BillingPlan } from "@/lib/polar/plan"

/**
 * Free improvements per UTC day. Free has none: the improver is a paid-plan
 * feature. `none` is not a plan but an unanswered Polar call, and it is never
 * read from this table — see `improverAllowance`.
 */
export const IMPROVER_DAILY_LIMIT = {
  free: 0,
  pro: 10,
  max: 20,
} as const satisfies Record<Exclude<BillingPlan, "none">, number>

/**
 * What the improver button may do right now, and the copy its tooltip needs.
 * `resetsAt` is an ISO string so the value crosses the server-action boundary
 * unchanged.
 */
export type ImproverAllowance =
  | { kind: "unavailable" }
  | { kind: "locked" }
  | { kind: "free"; remaining: number; limit: number; resetsAt: string }
  | { kind: "charged"; limit: number; resetsAt: string }
  | {
      kind: "exhausted"
      reason: "quota" | "balance"
      limit: number
      resetsAt: string
    }

export function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

function nextUtcDay(now: Date): string {
  const start = utcDayStart(now)
  start.setUTCDate(start.getUTCDate() + 1)
  return start.toISOString()
}

/**
 * Decides one improvement against the plan's daily quota. An unknown plan or
 * an unknown balance is `unavailable`: guessing "free" would hand out uses,
 * and guessing "locked" would tell a paying customer they are on Free.
 */
export function improverAllowance({
  plan,
  usedToday,
  overageBilling,
  balance,
  now,
}: {
  plan: BillingPlan
  usedToday: number
  overageBilling: boolean
  balance: number | null
  now: Date
}): ImproverAllowance {
  if (plan === "none") return { kind: "unavailable" }
  if (plan === "free") return { kind: "locked" }

  const limit = IMPROVER_DAILY_LIMIT[plan]
  const resetsAt = nextUtcDay(now)

  if (usedToday < limit) {
    return { kind: "free", remaining: limit - usedToday, limit, resetsAt }
  }

  if (!overageBilling) {
    return { kind: "exhausted", reason: "quota", limit, resetsAt }
  }

  if (balance === null) return { kind: "unavailable" }
  if (balance <= 0) {
    return { kind: "exhausted", reason: "balance", limit, resetsAt }
  }

  return { kind: "charged", limit, resetsAt }
}

/** Whether the button may run an improvement at all. */
export function canImprove(allowance: ImproverAllowance): boolean {
  return allowance.kind === "free" || allowance.kind === "charged"
}

export type ImproverTooltipKey =
  | "improveRemaining"
  | "improveCharged"
  | "improveExhausted"
  | "improveNoBalance"
  | "improveLocked"
  | "improveUnavailable"

/**
 * Which `GameComposer` message the button's tooltip shows, so the limit is
 * visible before it is reached rather than discovered by a disabled button.
 * `resetsAt` is returned only where the copy names the reset time; the
 * component formats it in the viewer's own locale and time zone.
 */
export function improverTooltip(allowance: ImproverAllowance): {
  key: ImproverTooltipKey
  values: Record<string, number>
  resetsAt?: string
} {
  switch (allowance.kind) {
    case "free":
      return {
        key: "improveRemaining",
        values: { remaining: allowance.remaining, limit: allowance.limit },
      }
    case "charged":
      return { key: "improveCharged", values: { limit: allowance.limit } }
    case "exhausted":
      return allowance.reason === "quota"
        ? {
            key: "improveExhausted",
            values: { limit: allowance.limit },
            resetsAt: allowance.resetsAt,
          }
        : {
            key: "improveNoBalance",
            values: { limit: allowance.limit },
            resetsAt: allowance.resetsAt,
          }
    case "locked":
      return { key: "improveLocked", values: {} }
    case "unavailable":
      return { key: "improveUnavailable", values: {} }
  }
}
