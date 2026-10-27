import { NextResponse } from "next/server"

import { startGameServer } from "@/lib/daytona/utils"
import { readGameTextFile } from "@/lib/games/files-server"
import { getGame } from "@/lib/games/queries"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * One file's text, for the Files tab viewer: `?path=` relative to the game
 * directory. Access follows `../route.ts` — owner only, never provisioning.
 *
 * A file the viewer cannot show as text (too large, binary, a directory)
 * still answers 200 with the reason, because that is a normal outcome the
 * tab renders, not a failed request. Only a bad path and a missing file are
 * errors.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const path = new URL(request.url).searchParams.get("path") ?? ""
  const game = await getGame(id)

  if (!game?.sandboxId) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  try {
    const { sandbox } = await startGameServer(game.sandboxId)
    const result = await readGameTextFile(sandbox.fs, path)

    if (!result.ok && result.reason === "invalid_path") {
      return new Response(null, { status: 400, headers: privateHeaders })
    }
    if (!result.ok && result.reason === "not_found") {
      return new Response(null, { status: 404, headers: privateHeaders })
    }

    return NextResponse.json(result, { headers: privateHeaders })
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders })
  }
}
