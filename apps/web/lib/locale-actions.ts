"use server"

import { cookies, headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"

import {
  isAppLocale,
  resolveLocale,
} from "@/i18n/locale-preference"
import { LOCALE_COOKIE_NAME } from "@/i18n/routing"
import {
  getAuthenticatedLocaleUser,
  saveAuthenticatedLocale,
} from "@/lib/locale-preference"

const LOCALE_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}

async function writeLocaleCookie(locale: string) {
  const store = await cookies()
  store.set(LOCALE_COOKIE_NAME, locale, LOCALE_COOKIE_OPTIONS)
}

/** Persist an explicit locale choice for the authenticated user, or in a cookie for a visitor. */
export async function setLocalePreference(value: unknown): Promise<void> {
  if (!isAppLocale(value)) throw new Error("Unsupported locale")

  // Anonymous and expired-session visitors only change their own locale cookie.
  // The helper validates any session before deriving the user identity.
  await saveAuthenticatedLocale(value)
  await writeLocaleCookie(value)
}

/** Bring a signed-in browser's cookie into line with the effective server locale. */
export async function reconcileLocaleCookie(): Promise<void> {
  const requestHeaders = await headers()
  if (!getSessionCookie(requestHeaders)) return

  const user = await getAuthenticatedLocaleUser()
  if (!user) return

  const store = await cookies()
  const locale = resolveLocale({
    userPreference: user.locale,
    cookiePreference: store.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  })

  if (store.get(LOCALE_COOKIE_NAME)?.value !== locale) {
    store.set(LOCALE_COOKIE_NAME, locale, LOCALE_COOKIE_OPTIONS)
  }
}
