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

/**
 * The text a "Create game" row would send as the new game's first message, or
 * `null` when there is none to offer: nothing typed, a `#` search (games
 * only), or a nested page, where the text filters that page's options.
 */
export function quickPromptOf(search: string, page: string | undefined): string | null {
  if (page) return null
  const { scope, text } = parseQuery(search)
  const prompt = text.trim()
  return scope === "games" || prompt === "" ? null : prompt
}
