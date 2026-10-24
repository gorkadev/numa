/** What a palette search is narrowed to. */
export type QueryScope = "all" | "commands" | "games"

const PREFIXES = { ">": "commands", "#": "games" } as const

/**
 * Splits a leading `>` (commands) or `#` (games) off the search, the way VS
 * Code and Raycast do; only a first character counts, so a title containing
 * either symbol still searches normally.
 */
export function parseQuery(search: string): { scope: QueryScope; text: string } {
  const prefix = search[0]
  if (prefix === ">" || prefix === "#") {
    return { scope: PREFIXES[prefix], text: search.slice(1).trimStart() }
  }
  return { scope: "all", text: search }
}
