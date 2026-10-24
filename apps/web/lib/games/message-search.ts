/**
 * The pure half of searching a player's chat messages: what the SQL `ILIKE`
 * is given, and the line the palette shows for a hit. The query itself lives
 * in `search-actions.ts`, behind the session.
 */

/** Shorter queries match almost every message, and cost a scan of every thread for nothing. */
export const MIN_MESSAGE_QUERY_LENGTH = 2

/** Escapes `%`, `_` and the escape character itself, so a query matches as typed. */
export function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * The first match in `text` with `radius` characters on each side, with an
 * ellipsis where the text goes on, or `null` when it does not match.
 */
export function matchSnippet(
  text: string,
  query: string,
  radius: number
): string | null {
  const flat = text.replace(/\s+/g, " ").trim()
  const index = flat.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return null

  const start = Math.max(0, index - radius)
  const end = Math.min(flat.length, index + query.length + radius)
  const body = flat.slice(start, end).trim()
  return `${start > 0 ? "…" : ""}${body}${end < flat.length ? "…" : ""}`
}
