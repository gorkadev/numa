import { NextResponse } from "next/server"

import { polar } from "@/lib/polar/client"
import { requireSession } from "@/lib/session"

type Document = "invoice" | "receipt"

const privateHeaders = { "cache-control": "no-store, private" }

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  )
}

function unavailable(error: unknown): Response {
  return new Response(null, {
    status: isNotFound(error) ? 404 : 503,
    headers: privateHeaders,
  })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string; document: string }> }
) {
  const session = await requireSession()
  const { orderId, document } = await context.params

  if (document !== "invoice" && document !== "receipt") {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  try {
    const customer = await polar.customers.getStateExternal({
      externalId: session.user.id,
    })
    const order = await polar.orders.get({ id: orderId })

    if (order.customerId !== customer.id) {
      return new Response(null, { status: 404, headers: privateHeaders })
    }

    const destination = await documentUrl(order.id, document)

    if (!destination) {
      return new Response(null, { status: 404, headers: privateHeaders })
    }

    return NextResponse.redirect(destination, { headers: privateHeaders })
  } catch (error) {
    return unavailable(error)
  }
}

async function documentUrl(
  orderId: string,
  document: Document
): Promise<string | null> {
  if (document === "invoice") {
    return (await polar.orders.invoice({ id: orderId })).url
  }

  return (await polar.orders.receipt({ id: orderId }))?.url ?? null
}
