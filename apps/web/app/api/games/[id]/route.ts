import { NextResponse } from "next/server"

import { isGameUnread } from "@/lib/games/activity"
import { signPreviewToken } from "@/lib/games/preview-token"
import { getGame } from "@/lib/games/queries"
import {
  DEFAULT_TEMPLATE_ID,
  isTemplateId,
} from "@/lib/games/templates/catalog"
import { isGameId, type GameRow } from "@/lib/games/thread-page"
import { readGameSettings } from "@/lib/settings/game-settings"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * The row a game's route draws. `getGame` authenticates and scopes to the
 * caller, so a missing game and another player's both read as a 404.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  if (!isGameId(id)) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  const [game, settings] = await Promise.all([getGame(id), readGameSettings()])

  if (!game) return new Response(null, { status: 404, headers: privateHeaders })

  const row: GameRow = {
    id: game.id,
    title: game.title,
    pinned: game.pinnedAt !== null,
    templateId: isTemplateId(game.templateId)
      ? game.templateId
      : DEFAULT_TEMPLATE_ID,
    /**
     * Signed here so the secret stays on the server. Its absence is the "is
     * there anything to preview" signal: until a first turn provisions a
     * sandbox the proxy has nothing to serve.
     */
    previewToken: game.sandboxId ? signPreviewToken(game.id) : undefined,
    lastTurnFinishedAt: game.lastTurnFinishedAt?.getTime() ?? 0,
    /**
     * Without the token and stream cursor the transport would open a fresh
     * session rather than rejoin the one this game already has.
     */
    session: game.chatAccessToken
      ? {
          publicAccessToken: game.chatAccessToken,
          lastEventId: game.lastEventId ?? undefined,
        }
      : undefined,
    unread: isGameUnread(game),
    settings: {
      wrapCodeBlocks: settings.wrapCodeBlocks,
      showSessionStats: settings.showSessionStats,
    },
  }

  return NextResponse.json(row, { headers: privateHeaders })
}
