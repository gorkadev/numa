"use server"

import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, type ChatStartSessionParams } from "@trigger.dev/sdk/ai"

import { getGame } from "@/lib/games/queries"
import { saveGameChatSession } from "@/lib/games/thread"
import type { gameChat } from "@/trigger/chat"

/**
 * These two actions are what the route handler's authentication check became.
 * The transport calls them from the browser; they run on the server, so
 * `TRIGGER_SECRET_KEY` never crosses to the client.
 *
 * Both re-establish the caller's organization and refuse a game it does not
 * own. That check is load-bearing rather than defensive: `chatId` arrives from
 * the browser, and the token these actions mint grants read and write on that
 * chat's session. Being signed in is not the same as owning this conversation.
 */

const start = chat.createStartSessionAction<typeof gameChat>("game-chat")

const TOKEN_EXPIRATION = "1h"

/**
 * Creates the chat Session and triggers its first run, returning the
 * session-scoped token the transport authenticates with. Idempotent on
 * (environment, chatId), so concurrent first messages converge on one session.
 */
export async function startGameChatSession(
  params: ChatStartSessionParams<typeof gameChat>
) {
  await assertGameOwner(params.chatId)

  const session = await start(params)

  /**
   * Persisted here, before the run has even booted, so that a tab reopened
   * while the first answer is still streaming is handed a session to resume
   * from. Waiting for `onTurnComplete` would publish the token only after the
   * answer it was needed for had already finished.
   */
  await saveGameChatSession({
    gameId: params.chatId,
    chatAccessToken: session.publicAccessToken,
  })

  return session
}

/**
 * A pure mint for an existing session. The transport calls this when its token
 * is rejected as expired, so it must never create anything.
 */
export async function mintGameChatAccessToken(chatId: string) {
  await assertGameOwner(chatId)

  return triggerAuth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: TOKEN_EXPIRATION,
  })
}

/**
 * `getGame` authenticates and folds the org into the lookup, so a game owned by
 * another organization is indistinguishable from one that does not exist — the
 * caller cannot probe for chat ids it does not own.
 */
async function assertGameOwner(gameId: string): Promise<void> {
  const game = await getGame(gameId)

  if (!game) throw new Error("Not found")
}
