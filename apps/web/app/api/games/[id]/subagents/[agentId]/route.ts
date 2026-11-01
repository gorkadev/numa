import { NextResponse } from "next/server"

import { getGame } from "@/lib/games/queries"
import { readSubagentRun } from "@/lib/games/thread"

const privateHeaders = { "cache-control": "no-store, private" }

/** One run's whole record, read when it is opened; scoped through `getGame`. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await context.params

  if (!(await getGame(id))) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  const run = await readSubagentRun(id, agentId)

  if (!run) return new Response(null, { status: 404, headers: privateHeaders })

  return NextResponse.json(run, { headers: privateHeaders })
}
