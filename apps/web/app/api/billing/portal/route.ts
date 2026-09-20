import { NextResponse } from "next/server"

import { polar } from "@/lib/polar/client"
import { requireSession } from "@/lib/session"

const privateHeaders = { "cache-control": "no-store, private" }

export async function GET() {
  const session = await requireSession()

  try {
    const customerSession = await polar.customerSessions.create({
      externalCustomerId: session.user.id,
    })

    return NextResponse.redirect(customerSession.customerPortalUrl, {
      headers: privateHeaders,
    })
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders })
  }
}
