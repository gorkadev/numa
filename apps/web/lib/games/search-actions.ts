"use server"

import { sql } from "drizzle-orm"

import { db } from "@workspace/db"

import {
  escapeLike,
  matchSnippet,
  MIN_MESSAGE_QUERY_LENGTH,
} from "@/lib/games/message-search"
import { GAME_LIST_COLUMNS, type GameListItem } from "@/lib/games/game-list"
import { isGameId } from "@/lib/games/thread-page"
import { containsPattern, foldedContains } from "@/lib/search-fold"
import { requireSession } from "@/lib/session"

const MAX_HITS = 8
const SNIPPET_RADIUS = 40

export type MessageHit = {
  gameId: string
  title: string
  snippet: string
  /** Where the matching message sits in the thread, so the palette can open it there. */
  position: number
  messageId: string
}

/**
 * The player's games whose chat mentions `query`, one hit per game, newest
 * first, for the command palette.
 *
 * The `user_id` predicate is the tenant boundary, as in every games query.
 * Only text parts are searched: `lax` jsonpath walks every message's parts
 * and skips any row whose stored shape differs instead of failing the query,
 * since `message` is unvalidated JSON. No index backs this; it scans the
 * caller's own rows only, which is fine at the size a player's history has
 * today, and the reason to revisit it is a slow palette, not a guess.
 */
export async function searchGameMessages(query: string): Promise<MessageHit[]> {
  const { user } = await requireSession()

  const needle = query.trim()
  if (needle.length < MIN_MESSAGE_QUERY_LENGTH) return []

  const { rows } = await db.execute<{
    id: string
    title: string
    text: string
    position: number
    message_id: string | null
  }>(sql`
    select distinct on (g.created_at, g.id)
      g.id, g.title, part.text, m.position, m.message ->> 'id' as message_id
    from games g
      join game_messages m on m.game_id = g.id,
      lateral jsonb_path_query(
        m.message, 'lax $.parts[*] ? (@.type == "text").text'
      ) as found(value),
      lateral (select found.value #>> '{}' as text) as part
    where g.user_id = ${user.id}
      and part.text ilike ${`%${escapeLike(needle)}%`} escape '\\'
    order by g.created_at desc, g.id, m.position
    limit ${MAX_HITS}
  `)

  return rows.flatMap((row) => {
    const snippet = matchSnippet(row.text, needle, SNIPPET_RADIUS)
    return snippet && row.message_id
      ? [
          {
            gameId: row.id,
            title: row.title,
            snippet,
            position: row.position,
            messageId: row.message_id,
          },
        ]
      : []
  })
}

/** At most this many games answer a title search; the palette is not a list view. */
const MAX_GAME_HITS = 20

/**
 * Games whose title contains the query, accents and case aside, across every
 * game the user has — the sidebar only holds the pages it has scrolled to, so
 * the palette asks the server rather than filtering what happens to be
 * loaded. Pinned games first, then newest first, the order the sidebar shows
 * them in.
 */
export async function searchGames(query: string): Promise<GameListItem[]> {
  const { user } = await requireSession()

  const pattern = containsPattern(query)
  if (!pattern) return []

  return db.query.games.findMany({
    columns: GAME_LIST_COLUMNS,
    where: (game, { and, eq }) =>
      and(
        eq(game.userId, user.id),
        foldedContains(game.title, pattern)
      ),
    orderBy: (game, { desc }) => [
      sql`${game.pinnedAt} desc nulls last`,
      desc(game.createdAt),
    ],
    limit: MAX_GAME_HITS,
  })
}

/**
 * One of the user's games as the palette lists it, for the game on screen
 * when it is not among the pages the sidebar has loaded. `null` when the id
 * is not one of theirs.
 */
export async function readGameListItem(
  id: string
): Promise<GameListItem | null> {
  const { user } = await requireSession()
  if (!isGameId(id)) return null

  const game = await db.query.games.findFirst({
    columns: GAME_LIST_COLUMNS,
    where: (game, { and, eq }) =>
      and(eq(game.id, id), eq(game.userId, user.id)),
  })

  return game ?? null
}
