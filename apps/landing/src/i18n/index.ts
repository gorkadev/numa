import { en } from "./en"
import { es } from "./es"

export type Locale = "en" | "es"

export const locales: Locale[] = ["en", "es"]

const dictionaries = { en, es }

export function t(locale: Locale) {
  return dictionaries[locale]
}

/** The path of the home page in a locale: English is unprefixed. */
export function homePath(locale: Locale) {
  return locale === "en" ? "/" : `/${locale}/`
}

/**
 * Where the app lives. Every call to action ends there, so it is one variable
 * rather than a URL scattered through the markup. Defaults to the local app.
 */
export const appUrl = (
  import.meta.env.PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/$/, "")

export const signInUrl = `${appUrl}/sign-in`
