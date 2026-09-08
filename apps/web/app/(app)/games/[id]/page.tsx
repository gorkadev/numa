import { notFound } from "next/navigation"

import { GameChat } from "@/components/game-chat"
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
  const { prompt } = await searchParams
  const initialPrompt = typeof prompt === "string" ? prompt : undefined

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

  return (
    <GameChat
      gameId={game.id}
      hasSandbox={Boolean(game.sandboxId)}
      initialMessages={game.messages}
      initialSessions={initialSessions}
      initialPrompt={initialPrompt}
    />
  )
}
