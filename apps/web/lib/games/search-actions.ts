"use server"

import { sql } from "drizzle-orm"

import { db } from "@workspace/db"

import {
  escapeLike,
  matchSnippet,
  MIN_MESSAGE_QUERY_LENGTH,
} from "@/lib/games/message-search"
import { requireSession } from "@/lib/session"

const MAX_HITS = 8
const SNIPPET_RADIUS = 40

export type MessageHit = { gameId: string; title: string; snippet: string }

/**
 * The player's games whose chat mentions `query`, one hit per game, newest
 * first, for the command palette.
 *
 * The `user_id` predicate is the tenant boundary, as in every games query.
 * Only text parts are searched: `lax` jsonpath walks every message's parts
 * and skips any row whose stored shape differs instead of failing the query,
 * since `messages` is unvalidated JSON. No index backs this; it scans the
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
  }>(sql`
    select distinct on (g.created_at, g.id) g.id, g.title, part.text
    from games g,
      lateral jsonb_path_query(
        g.messages, 'lax $[*].parts[*] ? (@.type == "text").text'
      ) as found(value),
      lateral (select found.value #>> '{}' as text) as part
    where g.user_id = ${user.id}
      and part.text ilike ${`%${escapeLike(needle)}%`} escape '\\'
    order by g.created_at desc, g.id
    limit ${MAX_HITS}
  `)

  return rows.flatMap((row) => {
    const snippet = matchSnippet(row.text, needle, SNIPPET_RADIUS)
    return snippet ? [{ gameId: row.id, title: row.title, snippet }] : []
  })
}
