import { NextResponse } from "next/server"

import { resumeGameSandbox } from "@/lib/daytona/utils"
import { contentCacheControl } from "@/lib/games/files"
import { readGameTextFile } from "@/lib/games/files-server"
import { getGame } from "@/lib/games/queries"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * One file's text, for the Files tab viewer: `?path=` relative to the game
 * directory, `?v=` the game version it is read at. Access follows
 * `../route.ts` — owner only, never provisioning — but the sandbox is only
 * resumed, not given a static server: reading text needs neither the server
 * nor its health check, and every call skipped is one less round trip.
 *
 * A versioned answer is cached by the browser for good (`contentCacheControl`):
 * the version changes whenever a turn rewrites files, so the same URL always
 * means the same bytes. Errors are never cached.
 *
 * A file the viewer cannot show as text (too large, binary)
 * still answers 200 with the reason, because that is a normal outcome the
 * tab renders, not a failed request. Only a bad path and a missing file are
 * errors.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const { searchParams } = new URL(request.url)
  const path = searchParams.get("path") ?? ""
  const game = await getGame(id)

  if (!game?.sandboxId) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  try {
    const { sandbox } = await resumeGameSandbox(game.sandboxId)
    const result = await readGameTextFile(sandbox.fs, path)

    if (!result.ok && result.reason === "invalid_path") {
      return new Response(null, { status: 400, headers: privateHeaders })
    }
    if (!result.ok && result.reason === "not_found") {
      return new Response(null, { status: 404, headers: privateHeaders })
    }

    return NextResponse.json(result, {
      /**
       * `Vary: Cookie` keys the browser's copy to the session that fetched it,
       * so another account signing in on the same browser can never be served
       * this owner's file from cache without passing the check above.
       */
      headers: {
        "cache-control": contentCacheControl(searchParams.get("v")),
        vary: "Cookie",
      },
    })
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders })
  }
}
