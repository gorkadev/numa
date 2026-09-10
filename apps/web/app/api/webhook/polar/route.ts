import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks"

/**
 * Receives Polar's webhook deliveries.
 *
 * THIS ROUTE MUST STAY PUBLICLY REACHABLE. Polar POSTs here from its own
 * infrastructure with no session, no cookie and no Clerk token — its
 * authentication is the signature verified below, and nothing else. Today that
 * works by accident rather than by design: `proxy.ts` calls `clerkMiddleware()`
 * without `auth.protect()`, so every route in this application is public. The
 * day somebody adds a blanket `auth.protect()` there, this endpoint starts
 * answering Polar with a redirect to `/sign-in`, Polar records a non-2xx
 * delivery, and every payment event is lost — silently, because nothing in this
 * application is watching for events that never arrived. Whoever tightens
 * `proxy.ts` has to exclude this path explicitly.
 */
export async function POST(request: Request): Promise<Response> {
  /**
   * The raw text, not `request.json()`. The signature is computed over the
   * exact bytes Polar sent, so verification has to run against those bytes:
   * parsing and re-serializing the JSON produces a payload that is equal in
   * meaning and different in bytes — key order, whitespace, number formatting —
   * and the signature check fails on every legitimate delivery.
   */
  const body = await request.text()

  try {
    const event = validateEvent(
      body,
      {
        /**
         * Standard Webhooks headers. Each falls back to an empty string rather
         * than being asserted present: a request missing them is not a crash,
         * it is an unsigned request, and it should take the same 403 path as a
         * forged one.
         */
        "webhook-id": request.headers.get("webhook-id") ?? "",
        "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
        "webhook-signature": request.headers.get("webhook-signature") ?? "",
      },
      /**
       * An unset `POLAR_WEBHOOK_SECRET` cannot produce a matching signature, so
       * a missing variable rejects every delivery instead of accepting them
       * unverified. That is the correct direction to fail, but it looks exactly
       * like a wrong secret from the outside — check the variable first when
       * real deliveries start coming back 403.
       */
      process.env.POLAR_WEBHOOK_SECRET ?? ""
    )

    switch (event.type) {
      case "order.paid":
        // TODO: grant credits for the purchased product to the organization
        // behind `externalCustomerId`.
        break

      case "customer.state_changed":
        // TODO: reconcile the local view of the customer's subscription and
        // meter balances.
        break
    }
  } catch (error) {
    /**
     * A failed signature is the one error with a defined answer: 403, and no
     * detail about why. Everything else — a payload the SDK could not parse, a
     * fault in the handling above — is re-thrown so it surfaces as a 500 that
     * Polar will retry, rather than being flattened into an acknowledgement of
     * an event that was never handled.
     */
    if (error instanceof WebhookVerificationError) {
      return Response.json({ received: false }, { status: 403 })
    }

    throw error
  }

  /**
   * 2xx acknowledges RECEIPT, not successful processing — it tells Polar to
   * stop retrying this delivery. While the cases above are TODO stubs the two
   * meanings coincide, and they stop coinciding the moment real work goes in
   * there. When it does, that work must not fail behind this 200: a credit
   * grant that throws has to either be retried here (so Polar sees a non-2xx
   * and redelivers) or be handed to something durable before this returns.
   * Swallowing it loses a payment the customer has already made.
   */
  return Response.json({ received: true })
}
