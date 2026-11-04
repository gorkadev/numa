import { sql, type AnyColumn, type SQL } from "drizzle-orm"

/**
 * Accented letters and what they fold to, pairwise. One table drives both
 * halves of a search — the typed text in JavaScript, the stored column in
 * Postgres's `translate()` — so the two sides can never disagree on what
 * "diseno" matches. Lowercase only: both sides lowercase first.
 */
const ACCENTED = "áàäâãåéèëêíìïîóòöôõúùüûñçý"
const PLAIN = "aaaaaaeeeeiiiiooooouuuuncy"

const FOLD = new Map([...ACCENTED].map((char, index) => [char, PLAIN[index]!]))

/** Lowercase with accents folded, as `foldedSql` folds a column. */
export function foldText(value: string): string {
  return [...value.toLowerCase()].map((char) => FOLD.get(char) ?? char).join("")
}

/**
 * A column lowercased with accents folded, for a search that matches
 * "diseno" to "Diseño" without storing a second, normalized copy of it.
 */
export function foldedSql(column: AnyColumn): SQL {
  return sql`translate(lower(${column}), ${ACCENTED}, ${PLAIN})`
}

/**
 * The `LIKE` pattern that finds the typed text anywhere in a folded column,
 * or `null` for no search. The escape character is `\`, so a typed `%` or
 * `_` is literal text.
 */
export function containsPattern(query: string): string | null {
  const needle = foldText(query.trim())
  if (!needle) return null
  return `%${needle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/** `column` contains the typed text, accents and case aside. */
export function foldedContains(column: AnyColumn, pattern: string): SQL {
  return sql`${foldedSql(column)} like ${pattern} escape '\\'`
}
