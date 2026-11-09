import { NextResponse, type NextRequest } from "next/server"

import { parseGamesCursor, parseGamesSort } from "@/lib/games/game-list"
import { readRecentGames } from "@/lib/games/queries"
import { getSession } from "@/lib/session"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * One page of the caller's unpinned games for the sidebar, `?after=` with the
 * previous page's `next` and `?sort=` with the order the first page used. The user comes from the session, never the request.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()

  if (!session) {
    return new Response(null, { status: 401, headers: privateHeaders })
  }

  const after = parseGamesCursor(request.nextUrl.searchParams.get("after"))

  if (after === null) {
    return new Response(null, { status: 400, headers: privateHeaders })
  }

  const sort = parseGamesSort(request.nextUrl.searchParams.get("sort"))

  return NextResponse.json(await readRecentGames(session.user.id, after, sort), {
    headers: privateHeaders,
  })
}
