import "server-only"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"
import { db, schema } from "@workspace/db"

import { isAppLocale, type AppLocale } from "@/i18n/locale-preference"
import { getSession } from "@/lib/session"

/**
 * Validate the request's session before reading the preference. Cookie presence
 * is only a fast anonymous-path check; it never establishes authorization.
 */
export async function getAuthenticatedLocalePreference(): Promise<AppLocale | null> {
  const requestHeaders = await headers()
  if (!getSessionCookie(requestHeaders)) return null

  const session = await getSession()
  if (!session) return null

  const [user] = await db
    .select({ locale: schema.user.locale })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .limit(1)

  return isAppLocale(user?.locale) ? user.locale : null
}

/** Authenticate from this request and return its database-owned user id. */
export async function getAuthenticatedLocaleUser(): Promise<{
  userId: string
  locale: AppLocale | null
} | null> {
  const requestHeaders = await headers()
  if (!getSessionCookie(requestHeaders)) return null

  const session = await getSession()
  if (!session) return null

  const [user] = await db
    .select({ locale: schema.user.locale })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .limit(1)

  return {
    userId: session.user.id,
    locale: isAppLocale(user?.locale) ? user.locale : null,
  }
}

export async function saveAuthenticatedLocale(
  locale: AppLocale
): Promise<boolean> {
  const user = await getAuthenticatedLocaleUser()
  if (!user) return false

  await db
    .update(schema.user)
    .set({ locale })
    .where(eq(schema.user.id, user.userId))

  return true
}
