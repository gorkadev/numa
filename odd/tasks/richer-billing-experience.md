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

### 1. Enrich plan-change confirmation — completed

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
- Commit: `f97135a` (`feat(web): enrich plan change details`).

### 2. Add private billing details and document routes — completed

**Outcome**
- An authenticated private/no-store details endpoint returns subscription lifecycle data, credits, next billing event, and recent orders without secrets or provider URLs.
- A portal route creates a Polar customer session and immediately redirects with private/no-store caching, without serializing its token or trusting the inbound Host as a return origin.
- Same-origin invoice/receipt routes validate the document kind and order ownership before issuing fresh private/no-store provider redirects.
- Pro/Max overlap selects the displayed plan and concrete subscription atomically with Max precedence.

**Checks**
- Passed focused ESLint and Prettier checks for all four new files.
- Passed full web typecheck and diff whitespace checks.
- Independent security verification: PASS after correcting redirect caching, return-origin trust, and plan/subscription selection.
- Runtime API inspection remains pending because no route-test/browser fixture was run.

**Evidence**
- Commit: pending authorized commit.

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
