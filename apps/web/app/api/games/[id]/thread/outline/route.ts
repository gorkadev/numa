import { NextResponse, type NextRequest } from "next/server"

import { getGame } from "@/lib/games/queries"
import { readOutlinePage } from "@/lib/games/thread"
import { parseCursor } from "@/lib/games/thread-page"

const privateHeaders = { "cache-control": "no-store, private" }

/** One page of the thread's turns; `getGame` makes another player's game read as missing. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const after = parseCursor(request.nextUrl.searchParams.get("after"))

  if (after === null) {
    return new Response(null, { status: 400, headers: privateHeaders })
  }

  if (!(await getGame(id))) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  return NextResponse.json(await readOutlinePage(id, after), {
    headers: privateHeaders,
  })
}
