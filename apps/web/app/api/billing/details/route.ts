import { NextResponse } from "next/server"

import { getBillingDetails } from "@/lib/polar/billing-details"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await requireSession()

  return NextResponse.json(await getBillingDetails(session.user.id), {
    headers: { "cache-control": "no-store, private" },
  })
}
