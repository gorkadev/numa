# Polar setup

Billing scaffolding for Numa, running against Polar's **sandbox** environment.
Nothing here takes real money yet.

## Environment

Sandbox and production are fully isolated Polar instances: separate dashboards,
separate organizations, separate access tokens, separate product ids. A
production token is rejected by the sandbox API and vice versa.

|                      |                                                            |
| -------------------- | ---------------------------------------------------------- |
| Dashboard            | https://sandbox.polar.sh                                   |
| API base             | https://sandbox-api.polar.sh                               |
| Organization         | `gorka-labs-test` (`ec27eb09-1c65-4ac2-b4e5-7eae16efc73c`) |
| Presentment currency | USD                                                        |

The organization's presentment currency must appear in every product's prices,
so a price in any other currency is rejected with a 422. Changing it requires
the organization to have no products, which is why the first EUR product was
archived rather than converted.

## Files

Created:

- `apps/web/lib/polar/client.ts` — the single `Polar` client. Reads
  `POLAR_SERVER`, so moving to production is an env change, not a code change.
- `apps/web/app/checkout/route.ts` — `GET /checkout?products=<id>`. Authenticated;
  attaches the caller's Clerk organization as `externalCustomerId`.
- `apps/web/app/api/webhook/polar/route.ts` — `POST /api/webhook/polar`,
  signature-verified, with `order.paid` and `customer.state_changed` as stubs.

Dependency added: `@polar-sh/sdk` in `apps/web`. The SDK only — no
`@polar-sh/nextjs` adapter, so the setup stays the same shape in any framework.

## How a payment is attributed

`externalCustomerId` is the only value joining Polar's world to this one. Polar
knows orders and customers; this database knows organizations. The checkout
route derives the organization from the Clerk session — never from the request —
and passes it as `externalCustomerId`, which Polar treats as unique and
immutable once set, so every later checkout from the same organization resolves
to the same Polar customer.

It is the organization id and not the user id deliberately: a team is billed
once, not once per member, and the person who clicked Subscribe may leave the
organization that keeps paying.

A signed-in user with **no active organization** is refused with a 409. That is
stricter than the rest of the application, where no organization simply means no
games. Here there is no personal account to fall back to — `games.orgId` is
`notNull` — so letting the checkout through would take money for a subscription
with no owner.

Verified against the sandbox API: a checkout created with
`external_customer_id` echoes it back on the session.

## Environment variables

In `apps/web/.env.local`, which `.gitignore` already covers via `.env*`. Names
only — values live in that file and nowhere else.

- `POLAR_SERVER` — `sandbox`
- `POLAR_ACCESS_TOKEN` — organization access token, created in **sandbox**.
  Scopes: `products`, `checkouts`, `webhooks`, `meters`, `organizations`.
- `POLAR_WEBHOOK_SECRET` — not set yet. Polar generates it when a webhook
  endpoint is registered, which needs a public HTTPS URL.

## Provisioned in sandbox

| Resource                                      | Id                                     |
| --------------------------------------------- | -------------------------------------- |
| Meter `Game credits`                          | `b60086c9-571f-4b2e-843a-fa9e380990f3` |
| Product `Numa Pro`, $20/month                 | `0355bc41-29d5-4ef2-9620-284976fe29b3` |
| Benefit: 2000 credits/month, rollover **off** | `aa621b36-045d-4bb6-870a-8455363920f2` |
| Product `Credit top-up`, $10 one-time         | `952739d7-b788-4fd7-929c-188ff100b662` |
| Benefit: 1000 credits, rollover **on**        | `7335ddc5-cad4-44f0-a235-428f862a30e4` |
| Product `Numa Pro` (archived, EUR)            | `3efde387-d81f-4fd3-920b-de380dea7328` |
| Webhook endpoint                              | none — needs a public URL              |

Rollover differs between the two benefits on purpose. The subscription's monthly
credits expire at the end of their cycle; letting them accumulate would grow an
unbounded liability. Credits bought separately do not expire, because the
customer has already paid for them and reclaiming them at month end would be
keeping their money.

## Credits

A credit is a unit of **price**, not of cost: 1 credit = 1 US cent of retail
value (`MICRO_USD_PER_CREDIT = 10_000`), and a turn consumes
`ceil(costMicroUsd * CREDIT_MARKUP / MICRO_USD_PER_CREDIT)` with
`CREDIT_MARKUP = 3`. Both constants live in `apps/web/lib/ai/pricing.ts`,
covered by `RATE_TABLE_VERSION`.

The indirection is what protects the margin. When `gemini-3.8-flash` doubles on
2027-01-01, the same turn consumes twice the credits and the price of a credit
never moves. Pricing in tokens would have inverted that — every rate change on
Google's side would re-price the product with nobody deciding to.

### How usage reaches Polar

`recordTurnUsage` writes the local `turn_usage` row first, then ingests a
`game_turn` event carrying `credits` in its metadata, then stamps
`credits_ingested_at`. The order is deliberate: a crash between the last two
leaves a row that looks un-ingested when it was, which is the safe direction,
because replay is free.

Replay is free because the event's `external_id` is `gameId:turn`, and Polar
deduplicates on it. **Verified empirically** against the sandbox — ingesting the
same event twice returns `{"inserted":1,"duplicates":0}` and then
`{"inserted":0,"duplicates":1}`. Polar's docs do not state this guarantee, so
re-check it if the ingestion API ever changes.

The reconciliation query is:

```sql
select * from turn_usage where credits > 0 and credits_ingested_at is null
```

### Two strings that are a contract

The meter filters on the event name `game_turn` and sums the metadata property
`credits`. Both live in `apps/web/lib/polar/events.ts` as named constants, and
both have a counterpart in the meter's configuration in Polar. Changing one side
alone does not fail — ingestion keeps accepting the events and the meter keeps
summing to zero, so customers spend credits nobody is charged for.

## Try it

```
pnpm dev
```

Then, signed in and with an active organization:

```
http://localhost:3000/checkout?products=0355bc41-29d5-4ef2-9620-284976fe29b3
```

Pay with the sandbox test card `4242 4242 4242 4242`, any future expiry, any
CVC. No discount code is needed — sandbox money is not money.

## Customer portal

There is nothing to build. Polar hosts the portal and emails customers their
link. An in-app "Manage billing" link is optional and deliberately absent.

## Before this is merged, or takes a real payment

- [ ] Register a webhook endpoint at `<public-url>/api/webhook/polar` and write
      the generated secret into `POLAR_WEBHOOK_SECRET`. Until then no event is
      delivered anywhere, and an unset secret rejects every delivery with 403.
- [ ] Replace the two webhook stubs with real handling. `order.paid` is where
      `externalCustomerId` is read back and turned into a credit grant; it is
      the other half of the join the checkout route now sets up.
- [ ] Make sure failing webhook work does not hide behind the route's `200`.
- [ ] Build the meter, the credit benefits and the top-up product. The token now
      has the scopes for it.
- [ ] Ingest usage events to Polar. `turn_usage` records cost locally, but
      nothing sends anything to a meter yet.
- [ ] Make `POLAR_SERVER` an explicit read that refuses to start when unset. It
      currently defaults to `sandbox`, which is the right way to fail in
      development and the wrong way to fail in production: forgetting the
      variable there would route real customers into sandbox silently.
- [ ] Exclude `/api/webhook/polar` explicitly if `proxy.ts` ever gains a blanket
      `auth.protect()`. Polar posts with no session, and a redirect to
      `/sign-in` loses every payment event without an error anywhere.
- [ ] Prices are in USD while Google Vertex bills in USD too, so margin math no
      longer crosses an FX boundary. Re-check this if the presentment currency
      ever changes again.
