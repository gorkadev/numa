/**
 * Username rules as the Better Auth `username` plugin enforces them on
 * `/update-user` (its defaults: 3 to 30 characters of letters, digits, "_"
 * and ".", stored lowercase). Checked in the browser only to answer before a
 * request; the server stays the authority, and also owns uniqueness.
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30

export type UsernameIssue = "tooShort" | "tooLong" | "invalid" | "taken"

/** The value the plugin will store: no surrounding spaces, no leading "@", lowercase. */
export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase()
}

export function usernameIssue(username: string): UsernameIssue | null {
  if (username.length < USERNAME_MIN_LENGTH) return "tooShort"
  if (username.length > USERNAME_MAX_LENGTH) return "tooLong"
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) return "invalid"
  return null
}

const ISSUE_BY_CODE: Record<string, UsernameIssue> = {
  USERNAME_IS_ALREADY_TAKEN: "taken",
  USERNAME_TOO_SHORT: "tooShort",
  USERNAME_TOO_LONG: "tooLong",
  INVALID_USERNAME: "invalid",
}

/** The issue behind an error code from the plugin; null for any other failure. */
export function usernameIssueFromCode(code: string | undefined) {
  return (code && ISSUE_BY_CODE[code]) || null
}
