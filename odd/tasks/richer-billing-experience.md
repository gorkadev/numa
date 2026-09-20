# Richer Billing Experience

## Goal

Give customers enough billing context to understand a plan change before confirming it and to inspect their current subscription, billing cycle, recent invoices, receipts, and Polar-managed billing account from Settings.

## Constraints

- Use Polar as the billing source of truth; do not hardcode prices, currency, billing intervals, period boundaries, invoice state, or scheduled changes.
- Keep all Polar organization-token calls server-side and tenant-scope every request from `requireSession().user.id`.
- Never return Polar access tokens, customer-session tokens, presigned document URLs, or unvalidated customer/order identifiers to client code.
- Keep `BillingSummary` small and preserve the authenticated shell's current latency characteristics.
- Load detailed billing history only when Settings → Billing is rendered.
- Preserve the existing server action as the only authority that changes a subscription.
- Follow installed Next.js 16.2.6 route-handler conventions and `@polar-sh/sdk` 0.49.0 generated types.
- Do not commit, push, or open a PR without explicit user authorization.

## Tasks

### 1. Enrich plan-change confirmation — implementation verified, awaiting commit authorization

**Outcome**
- Pro→Max and Max→Pro dialogs show current and target prices, currency/cadence, current billing period, effective date, and immediate charge/refund consequence.
- Current cadence comes from the full active Polar subscription; target pricing is shown only when one unambiguous active fixed recurring price exists.
- Upgrade estimates remain approximate and currency-safe; downgrade preserves Max through period end with no immediate charge or refund.
- Missing, ambiguous, or inconsistent Polar data degrades to generic non-numeric consequences.

**Checks**
- Passed focused ESLint and Prettier checks for all three affected files.
- Passed full web typecheck and `git diff --check`.
- Independent verification: PASS after correcting mixed-price and cadence-authority blockers.
- Runtime dialog inspection remains pending because no authenticated Pro/Max test scenario was available.

**Evidence**
- Commit: pending explicit authorization.

### 2. Add private billing details and document routes — pending

**Outcome**
- An authenticated details endpoint returns subscription lifecycle data and recent orders without secrets or provider URLs.
- A portal route creates a Polar customer session and redirects without serializing its token.
- Same-origin invoice/receipt routes verify order ownership before issuing fresh provider redirects.

**Checks**
- Focused lint/typecheck/format checks.
- Route-level ownership and secret-exposure review.
- Runtime API inspection when available.

**Evidence**
- Commit: pending explicit authorization.

### 3. Build the Settings billing history UI — pending

**Outcome**
- Settings → Billing lazily shows plan status, price/cadence, current period, renewal or scheduled change, credits, recent invoices/orders, and billing-management actions.
- Loading, unavailable, retry, and empty-history states are explicit.
- Opening unrelated settings sections does not fetch billing details.

**Checks**
- Focused lint/typecheck/format checks.
- Independent accessibility and stale-request verification.
- Runtime Settings inspection when available.

**Evidence**
- Commit: pending explicit authorization.
