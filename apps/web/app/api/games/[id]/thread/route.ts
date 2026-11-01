import { NextResponse, type NextRequest } from "next/server"

import type { SessionStats } from "@/lib/ai/session-usage"
import { getGame } from "@/lib/games/queries"
import { readThreadPage } from "@/lib/games/thread"
import { parseCursor } from "@/lib/games/thread-page"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * One page of the thread. A route rather than a server action because Next
 * runs actions one at a time, which would queue a page behind anything else in
 * flight. `getGame` scopes the lookup to the caller, so another player's game
 * reads as missing.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const before = parseCursor(request.nextUrl.searchParams.get("before"))

  if (before === null) {
    return new Response(null, { status: 400, headers: privateHeaders })
  }

  const game = await getGame(id)

  if (!game) return new Response(null, { status: 404, headers: privateHeaders })

  const page = await readThreadPage(id, before)

  return NextResponse.json(
    { ...page, stats: game.sessionStats as SessionStats | null },
    { headers: privateHeaders }
  )
}
