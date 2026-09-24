import { cookies, headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"
import { getRequestConfig } from "next-intl/server"

import { resolveLocale } from "./locale-preference"
import { LOCALE_COOKIE_NAME } from "./routing"
import { getAuthenticatedLocalePreference } from "@/lib/locale-preference"

export default getRequestConfig(async () => {
  const requestHeaders = await headers()
  const cookieStore = await cookies()
  const hasSession = Boolean(getSessionCookie(requestHeaders))
  const userPreference = hasSession
    ? await getAuthenticatedLocalePreference()
    : null
  const locale = resolveLocale({
    userPreference,
    cookiePreference: cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  })

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
