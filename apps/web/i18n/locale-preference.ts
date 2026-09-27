import { routing } from "./routing"

export type AppLocale = (typeof routing.locales)[number]

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    routing.locales.includes(value as AppLocale)
  )
}

/**
 * Resolve an Accept-Language header by quality, preserving listed order on ties.
 */
export function localeFromAcceptLanguage(
  acceptLanguage: string | null
): AppLocale | null {
  if (!acceptLanguage) return null

  const candidates = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [rawTag, ...parameters] = entry.trim().split(";")
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q=")
      )
      const quality = qualityParameter
        ? Number(qualityParameter.trim().slice(2))
        : 1

      return {
        tag: rawTag?.trim().toLowerCase(),
        quality: Number.isFinite(quality) && quality > 0 ? quality : 0,
        index,
      }
    })
    .filter((candidate) => candidate.tag && candidate.quality > 0)
    .sort(
      (left, right) => right.quality - left.quality || left.index - right.index
    )

  for (const { tag } of candidates) {
    const language = tag!.split("-")[0]
    if (isAppLocale(language)) return language
  }

  return null
}

export function resolveLocale({
  userPreference,
  cookiePreference,
  acceptLanguage,
}: {
  userPreference?: unknown
  cookiePreference?: unknown
  acceptLanguage: string | null
}): AppLocale {
  if (isAppLocale(userPreference)) return userPreference
  if (isAppLocale(cookiePreference)) return cookiePreference
  return localeFromAcceptLanguage(acceptLanguage) ?? routing.defaultLocale
}
