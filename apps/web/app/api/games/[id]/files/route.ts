import { NextResponse } from "next/server"

import { startGameServer } from "@/lib/daytona/utils"
import { buildFileTree } from "@/lib/games/files"
import { listGameFiles } from "@/lib/games/files-server"
import { getGameSandboxId } from "@/lib/games/queries"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * The game directory as a tree, for the chat's Files tab.
 *
 * `getGameSandboxId` scopes the lookup to the caller, so another user's game reads as
 * missing. A game with no sandbox is reported as missing too rather than
 * provisioned: browsing files must never create compute. An archived sandbox
 * is resumed through `startGameServer`, the same path the preview takes, so
 * the asset URLs the viewer builds on the preview proxy work as soon as this
 * answers.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const sandboxId = await getGameSandboxId(id)

  if (!sandboxId) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  try {
    const { sandbox } = await startGameServer(sandboxId)
    const files = await listGameFiles(sandbox.fs)
    return NextResponse.json({ tree: buildFileTree(files) }, { headers: privateHeaders })
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders })
  }
}
