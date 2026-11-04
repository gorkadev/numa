import { NextResponse, type NextRequest } from "next/server"

import { parseLibraryCursor, parseLibraryTab } from "@/lib/library"
import { readLibraryPage } from "@/lib/library-queries"
import { getSession } from "@/lib/session"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * One page of the caller's library: `?tab=all|image|document`, `?q=` to
 * search names, `?after=` with the previous page's `next` cursor. The user
 * comes from the session, never from the request.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()

  if (!session) {
    return new Response(null, { status: 401, headers: privateHeaders })
  }

  const params = request.nextUrl.searchParams
  const after = parseLibraryCursor(params.get("after"))

  if (after === null) {
    return new Response(null, { status: 400, headers: privateHeaders })
  }

  const page = await readLibraryPage(session.user.id, {
    tab: parseLibraryTab(params.get("tab")),
    query: (params.get("q") ?? "").slice(0, 200),
    after,
  })

  return NextResponse.json(page, { headers: privateHeaders })
}
