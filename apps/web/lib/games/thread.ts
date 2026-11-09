import { createHash } from "node:crypto"

import { db } from "@workspace/db"
import { gameMessages, games, gameSubagentRuns } from "@workspace/db/schema"
import { and, asc, desc, eq, gt, gte, lt, sql } from "drizzle-orm"
import type { UIMessage } from "ai"

import { sessionStats } from "@/lib/ai/session-usage"
import type { SubagentRunRecord } from "@/lib/games/harness/records"
import type { StoredOutlineTurn } from "@/lib/games/thread-outline"
import {
  changedRows,
  chunkRows,
  jsonbText,
  OUTLINE_PAGE_TURNS,
  OUTLINE_TEXT_CHARS,
  pageStart,
  SAVE_CHUNK_ROWS,
  SUBAGENT_PAGE_RUNS,
  subagentRows,
  THREAD_PAGE_TURNS,
  threadRows,
  type ListedSubagentRun,
  type StoredOutlinePage,
  type SubagentRunPage,
  type ThreadPage,
} from "@/lib/games/thread-page"
import { collectThreadSubagentRuns, trimMessage } from "@/lib/games/tool-parts"

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
 * The page of history ending just before `before`, or at the thread's end when
 * it is absent, and the position that page starts at. Its bounds are worked out
 * from `role` and `size` alone, over at most `THREAD_PAGE_TURNS` turns, so no
 * body is read to decide what a page holds. A thread with fewer turns left than
 * that measures from 0, which takes in anything ahead of its first user message.
 *
 * This is what the browser receives, so tool parts come back trimmed; anything
 * feeding the agent reads `loadGameThread`, which never trims.
 *
 * No tenant predicate, like everything here: the routes that call this have
 * already resolved the game through `getGame`.
 */
export async function readThreadPage(
  gameId: string,
  before?: number
): Promise<ThreadPage> {
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

  const sizes = await db
    .select({
      position: gameMessages.position,
      role: gameMessages.role,
      size: gameMessages.size,
    })
    .from(gameMessages)
    .where(and(inRange, gte(gameMessages.position, anchor?.position ?? 0)))
    .orderBy(asc(gameMessages.position))

  const start = pageStart(sizes)

  const rows = await db
    .select({ message: gameMessages.message })
    .from(gameMessages)
    .where(and(inRange, gte(gameMessages.position, start)))
    .orderBy(asc(gameMessages.position))

  return { messages: rows.map(({ message }) => trimMessage(message)), start }
}

/**
 * One page of the thread's turns, oldest first, after position `after`. The
 * text is joined and cut in Postgres, so a pasted novel stays there.
 */
export async function readOutlinePage(
  gameId: string,
  after?: number
): Promise<StoredOutlinePage> {
  const turns = await db
    .select({
      id: sql<string>`${gameMessages.message}->>'id'`,
      position: gameMessages.position,
      text: sql<string>`left(
        btrim(coalesce(
          (
            select string_agg(part->>'text', ' ')
            from jsonb_array_elements(${gameMessages.message}->'parts') as part
            where part->>'type' = 'text'
          ),
          ''
        )),
        ${OUTLINE_TEXT_CHARS}::integer
      )`,
    })
    .from(gameMessages)
    .where(
      and(
        eq(gameMessages.gameId, gameId),
        eq(gameMessages.role, "user"),
        after === undefined ? undefined : gt(gameMessages.position, after)
      )
    )
    .orderBy(asc(gameMessages.position))
    .limit(OUTLINE_PAGE_TURNS)

  return {
    turns: turns satisfies StoredOutlineTurn[],
    next: turns.length === OUTLINE_PAGE_TURNS ? turns.at(-1)!.position : null,
  }
}

/** One page of the game's runs in dispatch order, without what only a run's detail reads. */
export async function readSubagentRunPage(
  gameId: string,
  after?: number
): Promise<SubagentRunPage> {
  const rows = await db
    .select({
      position: gameSubagentRuns.position,
      run: sql<ListedSubagentRun>`${gameSubagentRuns.record} - 'timeline' - 'toolCalls' - 'prompt' - 'summary'`,
    })
    .from(gameSubagentRuns)
    .where(
      and(
        eq(gameSubagentRuns.gameId, gameId),
        after === undefined ? undefined : gt(gameSubagentRuns.position, after)
      )
    )
    .orderBy(asc(gameSubagentRuns.position))
    .limit(SUBAGENT_PAGE_RUNS)

  return {
    runs: rows.map(({ run }) => run),
    next: rows.length === SUBAGENT_PAGE_RUNS ? rows.at(-1)!.position : null,
  }
}

export async function readSubagentRun(
  gameId: string,
  agentId: string
): Promise<SubagentRunRecord | undefined> {
  const [row] = await db
    .select({ record: gameSubagentRuns.record })
    .from(gameSubagentRuns)
    .where(
      and(
        eq(gameSubagentRuns.gameId, gameId),
        eq(gameSubagentRuns.agentId, agentId)
      )
    )

  return row?.record as SubagentRunRecord | undefined
}

/**
 * Rewrites the whole thread, position by position: one game owns one chat, so
 * a turn hands over the full document. Only rows whose message changed travel
 * to the database, in chunks, so a save costs what the turn added rather than
 * what the thread weighs; rows past the new end are removed.
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
  messageSent = false,
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
  /**
   * Stamps `last_message_at`, the sidebar's activity order. Only the save at
   * the start of a turn passes it: that turn is the player's message.
   */
  messageSent?: boolean
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [game] = await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.id, gameId))
      .for("update")

    if (!game) return

    const rows = threadRows(gameId, messages)

    const stored = await tx
      .select({
        position: gameMessages.position,
        hash: sql<string>`md5(${gameMessages.message}::text)`,
      })
      .from(gameMessages)
      .where(eq(gameMessages.gameId, gameId))

    const changed = changedRows(
      rows,
      new Map(stored.map(({ position, hash }) => [position, hash])),
      ({ message }) => createHash("md5").update(jsonbText(message)).digest("hex")
    )

    for (const chunk of chunkRows(changed, SAVE_CHUNK_ROWS)) {
      await tx
        .insert(gameMessages)
        .values(chunk)
        .onConflictDoUpdate({
          target: [gameMessages.gameId, gameMessages.position],
          set: {
            role: sql`excluded.role`,
            message: sql`excluded.message`,
            size: sql`excluded.size`,
          },
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

    await tx
      .update(games)
      .set({
        sessionStats: sessionStats(messages),
        ...(chatAccessToken === undefined ? {} : { chatAccessToken }),
        ...(lastEventId === undefined ? {} : { lastEventId }),
        ...(turnFinished ? { lastTurnFinishedAt: sql`now()` } : {}),
        ...(messageSent ? { lastMessageAt: sql`now()` } : {}),
      })
      .where(eq(games.id, gameId))
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

  /** Compared here so a finished run costs nothing on later saves, as with messages. */
  const stored = await tx
    .select({
      agentId: gameSubagentRuns.agentId,
      position: gameSubagentRuns.position,
      hash: sql<string>`md5(${gameSubagentRuns.record}::text)`,
    })
    .from(gameSubagentRuns)
    .where(eq(gameSubagentRuns.gameId, gameId))

  const held = new Map(stored.map((run) => [run.agentId, run]))
  const changed = rows.filter(({ agentId, position, record }) => {
    const run = held.get(agentId)

    return (
      run?.position !== position ||
      run.hash !== createHash("md5").update(jsonbText(record)).digest("hex")
    )
  })

  for (const chunk of chunkRows(changed, SAVE_CHUNK_ROWS)) {
    await tx
      .insert(gameSubagentRuns)
      .values(chunk)
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

  /** One parameter however many runs there are, unlike `not in` with a list. */
  const kept = JSON.stringify(rows.map(({ agentId }) => agentId))

  await tx.delete(gameSubagentRuns).where(
    and(
      eq(gameSubagentRuns.gameId, gameId),
      sql`${gameSubagentRuns.agentId} not in (
        select jsonb_array_elements_text(${kept}::jsonb)
      )`
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
