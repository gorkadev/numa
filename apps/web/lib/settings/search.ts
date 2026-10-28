import type { SectionId } from "@/lib/settings/sections"

/** One setting as the search box sees it: every string already translated. */
export type SearchableSetting = {
  id: string
  section: SectionId
  title: string
  sectionLabel: string
  description?: string
  keywords?: string
}

/** Lowercase without accents, so "contrasena" finds "Contraseña". */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/**
 * The settings every word of `query` appears in, best first: a title that
 * starts with the query, then a title holding every word, then keywords, the
 * section name and finally the description. Ties keep index order, which is
 * the order the dialog lists them in.
 */
export function searchSettings<T extends SearchableSetting>(
  settings: T[],
  query: string
): T[] {
  const needle = normalizeForSearch(query.trim())
  const words = needle.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const ranked = settings.flatMap((setting, index) => {
    const title = normalizeForSearch(setting.title)
    const haystack = normalizeForSearch(
      [
        setting.title,
        setting.keywords,
        setting.sectionLabel,
        setting.description,
      ].join(" ")
    )
    if (!words.every((word) => haystack.includes(word))) return []

    const inField = (field?: string) =>
      words.every((word) => normalizeForSearch(field ?? "").includes(word))
    const rank = title.startsWith(needle)
      ? 0
      : inField(setting.title)
        ? 1
        : inField(setting.keywords)
          ? 2
          : inField(setting.sectionLabel)
            ? 3
            : 4

    return [{ setting, rank, index }]
  })

  return ranked
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((hit) => hit.setting)
}
