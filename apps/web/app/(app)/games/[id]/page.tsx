import { notFound } from "next/navigation"

import { GameChat } from "@/components/game-chat"
import { isTierId } from "@/lib/ai/model-catalog"
import { signPreviewToken } from "@/lib/games/preview-token"
import { getGame } from "@/lib/games/queries"

export default async function GamePage({
  params,
  searchParams,
}: PageProps<"/games/[id]">) {
  const { id } = await params

  /**
   * A game created from the home screen arrives with the prompt that named it
   * still in the query string, because the thread — not the create action — is
   * what sends a message. Repeated keys arrive as an array; only a single value
   * is a prompt.
   */
  const { prompt, tier } = await searchParams
  const initialPrompt = typeof prompt === "string" ? prompt : undefined

  /**
   * The tier that screen was showing, travelling with it. Anything else in
   * the parameter is ignored rather than corrected: the thread already starts
   * on the default, so an edited URL simply does not move it.
   */
  const initialTierId = isTierId(tier) ? tier : undefined

  /**
   * `getGame` authenticates and scopes to the caller's org, so a missing game
   * and one owned by another organization both land here as a 404.
   */
  const game = await getGame(id)

  if (!game) notFound()

  /**
   * The persisted thread is rendered on the server, so a reload restores the
   * conversation without a client-side fetch. The chat session travels with it:
   * without the token and stream cursor the transport would open a fresh
   * session rather than rejoin the one this game already has.
   */
  const initialSessions = game.chatAccessToken
    ? {
        [game.id]: {
          publicAccessToken: game.chatAccessToken,
          lastEventId: game.lastEventId ?? undefined,
        },
      }
    : undefined

  /**
   * The preview's authorization, minted here so the signing secret stays on the
   * server. It doubles as the "is there anything to preview" signal: until the
   * chat's first turn provisions a sandbox the proxy has nothing to serve, and a
   * token for a pane that will not render is pointless — so a null `sandboxId`
   * yields no token, and the pane is left out entirely rather than shown broken.
   */
  const previewToken = game.sandboxId ? signPreviewToken(game.id) : undefined

  return (
    <GameChat
      gameId={game.id}
      title={game.title}
      previewToken={previewToken}
      initialMessages={game.messages}
      initialSessions={initialSessions}
      initialPrompt={initialPrompt}
      initialTierId={initialTierId}
    />
  )
}
