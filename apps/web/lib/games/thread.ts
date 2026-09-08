import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import type { UIMessage } from "ai"

/**
 * A game's chat thread lives in `games.messages`, alongside the two fields the
 * chat transport needs to resume it: the session token and the stream cursor.
 *
 * These helpers run inside the `chat.agent` task, which executes on
 * Trigger.dev — there is no Clerk request context there, so they cannot scope
 * to an organization the way `lib/games/queries.ts` does. The tenant boundary
 * moved rather than disappeared: reaching this code at all requires a
 * session-scoped token, and those are minted only by the two server actions in
 * `lib/games/chat-actions.ts`, each of which resolves the caller's org and
 * refuses a game it does not own.
 */

/**
 * Returns the persisted thread, or an empty array for a game with no messages
 * yet. Unlike the previous route handler this does not distinguish a missing
 * game: the agent is only ever reached for a chat id its owner authorized.
 *
 * The column's `UIMessage[]` type is an assertion, not a guarantee — `jsonb`
 * validates only that the value is JSON. The incoming message is validated by
 * the runtime before `hydrateMessages` sees it; stored history is trusted
 * because this application wrote it.
 */
export async function loadGameThread(gameId: string): Promise<UIMessage[]> {
  const game = await db.query.games.findFirst({
    columns: { messages: true },
    where: (game, { eq }) => eq(game.id, gameId),
  })

  return game?.messages ?? []
}

/**
 * Rewrites the whole thread — one game owns one chat, so a turn is a full
 * document write rather than an append.
 *
 * `lastEventId` and the session token are written in the same statement as the
 * messages because they describe the same instant: persisting the reply without
 * advancing the cursor leaves the next reload resuming from before it.
 */
export async function saveGameThread({
  gameId,
  messages,
  chatAccessToken,
  lastEventId,
}: {
  gameId: string
  messages: UIMessage[]
  chatAccessToken?: string
  lastEventId?: string
}): Promise<void> {
  await db
    .update(games)
    .set({ messages, chatAccessToken, lastEventId })
    .where(eq(games.id, gameId))
}

/**
 * Records the chat session's token on its own, without touching the thread.
 *
 * This is written the moment the session is created rather than when the first
 * turn ends, and that timing is the whole point: the transport resumes a stream
 * only from a session it was handed on the first render, and it never creates
 * one lazily to reconnect. Persisting only at the end of a turn leaves the
 * window that matters — a tab reopened while the first answer is still
 * streaming — with nothing to resume from, so the reply appears only once it
 * has finished.
 */
export async function saveGameChatSession({
  gameId,
  chatAccessToken,
}: {
  gameId: string
  chatAccessToken: string
}): Promise<void> {
  await db.update(games).set({ chatAccessToken }).where(eq(games.id, gameId))
}
