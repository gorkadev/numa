import { NextResponse, type NextRequest } from "next/server"

import { getGame } from "@/lib/games/queries"
import { readSubagentRunPage } from "@/lib/games/thread"
import { isGameId, parseCursor } from "@/lib/games/thread-page"

const privateHeaders = { "cache-control": "no-store, private" }

/** One page of the game's runs; `getGame` makes another player's game read as missing. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  if (!isGameId(id)) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }
  const after = parseCursor(request.nextUrl.searchParams.get("after"))

  if (after === null) {
    return new Response(null, { status: 400, headers: privateHeaders })
  }

  if (!(await getGame(id))) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  return NextResponse.json(await readSubagentRunPage(id, after), {
    headers: privateHeaders,
  })
}
