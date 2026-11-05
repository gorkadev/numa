import { cookies, headers } from "next/headers"
import * as rootParams from "next/root-params"
import { getSessionCookie } from "better-auth/cookies"
import { hasLocale } from "next-intl"
import { getRequestConfig } from "next-intl/server"

import { resolveLocale } from "./locale-preference"
import { LOCALE_COOKIE_NAME, routing } from "./routing"
import { getAuthenticatedLocalePreference } from "@/lib/locale-preference"

/**
 * The locale of the route being rendered, when there is one.
 *
 * Server Components read it from the `[locale]` root parameter, which the
 * proxy has already negotiated from the cookie and `Accept-Language`. It needs
 * no request data, so a page can be prerendered with it. Server Actions and
 * Route Handlers have no root parameters, so they get `undefined`.
 */
async function localeOfRoute(): Promise<string | undefined> {
  try {
    return await rootParams.locale()
  } catch {
    return undefined
  }
}

export default getRequestConfig(async () => {
  const routeLocale = await localeOfRoute()
  const locale = hasLocale(routing.locales, routeLocale)
    ? routeLocale
    : await resolveRequestLocale()

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})

/**
 * Account, then cookie, then `Accept-Language`: the precedence a request
 * without a route gets, so an action answers in the language the account
 * chose even before this browser's cookie caught up.
 */
async function resolveRequestLocale() {
  const requestHeaders = await headers()
  const cookieStore = await cookies()
  const hasSession = Boolean(getSessionCookie(requestHeaders))
  const userPreference = hasSession
    ? await getAuthenticatedLocalePreference()
    : null

  return resolveLocale({
    userPreference,
    cookiePreference: cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  })
}
