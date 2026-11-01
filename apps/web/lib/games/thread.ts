import { db } from "@workspace/db"
import { gameMessages, games, gameSubagentRuns } from "@workspace/db/schema"
import { and, asc, desc, eq, gte, lt, notInArray, sql } from "drizzle-orm"
import type { UIMessage } from "ai"

import {
  subagentRows,
  THREAD_PAGE_TURNS,
  threadRows,
} from "@/lib/games/thread-page"
import { collectThreadSubagentRuns } from "@/lib/games/tool-parts"

/**
 * A game's chat thread lives in `game_messages`, one row per message; the two
 * fields the chat transport needs to resume it, the session token and the
 * stream cursor, stay on `games`.
 *
 * These helpers run inside the `chat.agent` task, which executes on
 * Trigger.dev — there is no request-bound session there, so they cannot scope
 * to a user the way `lib/games/queries.ts` does. The tenant boundary moved
 * rather than disappeared: reaching this code at all requires a
 * session-scoped token, and those are minted only by the two server actions in
 * `lib/games/chat-actions.ts`, each of which resolves the caller's identity
 * and refuses a game it does not own.
 */

/**
 * Returns the persisted thread, or an empty array for a game with no messages
 * yet. Unlike the previous route handler this does not distinguish a missing
 * game: the agent is only ever reached for a chat id its owner authorized.
 *
 * The column's `UIMessage` type is an assertion, not a guarantee — `jsonb`
 * validates only that the value is JSON. The incoming message is validated by
 * the runtime before `hydrateMessages` sees it; stored history is trusted
 * because this application wrote it.
 */
export async function loadGameThread(gameId: string): Promise<UIMessage[]> {
  const rows = await db
    .select({ message: gameMessages.message })
    .from(gameMessages)
    .where(eq(gameMessages.gameId, gameId))
    .orderBy(asc(gameMessages.position))

  return rows.map(({ message }) => message)
}

/**
 * The last `THREAD_PAGE_TURNS` turns before `before`, or of the whole thread
 * when it is absent, and the position that page starts at. A thread with fewer
 * turns left than that starts at 0, which also takes in anything sitting ahead
 * of its first user message.
 *
 * No tenant predicate, like everything here: the page and the server action
 * that call this have already resolved the game through `getGame`.
 */
export async function readThreadPage(
  gameId: string,
  before?: number
): Promise<{ messages: UIMessage[]; start: number }> {
  const inRange = and(
    eq(gameMessages.gameId, gameId),
    before === undefined ? undefined : lt(gameMessages.position, before)
  )

  const [anchor] = await db
    .select({ position: gameMessages.position })
    .from(gameMessages)
    .where(and(inRange, eq(gameMessages.role, "user")))
    .orderBy(desc(gameMessages.position))
    .offset(THREAD_PAGE_TURNS - 1)
    .limit(1)

  const start = anchor?.position ?? 0

  const rows = await db
    .select({ message: gameMessages.message })
    .from(gameMessages)
    .where(and(inRange, gte(gameMessages.position, start)))
    .orderBy(asc(gameMessages.position))

  return { messages: rows.map(({ message }) => message), start }
}

/**
 * Every reply before `start`, reduced to what the session totals read. The
 * projection happens in Postgres, so the message bodies never leave the
 * database. See `EarlierThread`.
 */
export async function readEarlierStats(
  gameId: string,
  start: number
): Promise<UIMessage[]> {
  if (start === 0) return []

  const rows = await db
    .select({
      stats: sql<UIMessage>`jsonb_build_object(
        'id', ${gameMessages.message}->'id',
        'role', ${gameMessages.message}->'role',
        'metadata', coalesce(${gameMessages.message}->'metadata', '{}'::jsonb),
        'parts', '[]'::jsonb
      )`,
    })
    .from(gameMessages)
    .where(
      and(
        eq(gameMessages.gameId, gameId),
        eq(gameMessages.role, "assistant"),
        lt(gameMessages.position, start)
      )
    )
    .orderBy(asc(gameMessages.position))

  return rows.map(({ stats }) => stats)
}

/**
 * Rewrites the whole thread, position by position: one game owns one chat, so
 * a turn hands over the full document. Rows whose message did not change are
 * left alone, and rows past the new end are removed.
 *
 * `lastEventId` and the session token are written in the same transaction as
 * the messages because they describe the same instant: persisting the reply
 * without advancing the cursor leaves the next reload resuming from before it.
 *
 * The game's row is locked first, for two reasons: a deleted game stays a
 * no-op rather than a foreign key error at the end of a turn, and two saves of
 * one thread cannot interleave their rows.
 */
export async function saveGameThread({
  gameId,
  messages,
  chatAccessToken,
  lastEventId,
  turnFinished = false,
}: {
  gameId: string
  messages: UIMessage[]
  chatAccessToken?: string
  lastEventId?: string
  /**
   * Stamps `last_turn_finished_at` in this same transaction, so the end of a
   * turn costs no write of its own. Only the end-of-turn save passes it; the
   * save at the start of a turn must not, or a turn would read as finished
   * the moment it began.
   */
  turnFinished?: boolean
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [game] = await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.id, gameId))
      .for("update")

    if (!game) return

    const rows = threadRows(gameId, messages)

    if (rows.length > 0) {
      await tx
        .insert(gameMessages)
        .values(rows)
        .onConflictDoUpdate({
          target: [gameMessages.gameId, gameMessages.position],
          set: {
            role: sql`excluded.role`,
            message: sql`excluded.message`,
          },
          setWhere: sql`${gameMessages.message} is distinct from excluded.message`,
        })
    }

    await tx
      .delete(gameMessages)
      .where(
        and(
          eq(gameMessages.gameId, gameId),
          gte(gameMessages.position, rows.length)
        )
      )

    await saveSubagentRuns(tx, gameId, messages)

    const session = {
      ...(chatAccessToken === undefined ? {} : { chatAccessToken }),
      ...(lastEventId === undefined ? {} : { lastEventId }),
      ...(turnFinished ? { lastTurnFinishedAt: sql`now()` } : {}),
    }

    if (Object.keys(session).length > 0) {
      await tx.update(games).set(session).where(eq(games.id, gameId))
    }
  })
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Derived from the messages being saved, so the two can never disagree. */
export async function saveSubagentRuns(
  tx: Transaction,
  gameId: string,
  messages: UIMessage[]
): Promise<void> {
  const rows = subagentRows(gameId, collectThreadSubagentRuns(messages))

  if (rows.length > 0) {
    await tx
      .insert(gameSubagentRuns)
      .values(rows)
      .onConflictDoUpdate({
        target: [gameSubagentRuns.gameId, gameSubagentRuns.agentId],
        set: {
          position: sql`excluded.position`,
          record: sql`excluded.record`,
        },
        setWhere: sql`${gameSubagentRuns.record} is distinct from excluded.record
          or ${gameSubagentRuns.position} is distinct from excluded.position`,
      })
  }

  await tx.delete(gameSubagentRuns).where(
    and(
      eq(gameSubagentRuns.gameId, gameId),
      rows.length > 0
        ? notInArray(
            gameSubagentRuns.agentId,
            rows.map(({ agentId }) => agentId)
          )
        : undefined
    )
  )
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
