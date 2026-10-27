"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"

import type { SearchableSetting } from "@/lib/settings/search"
import { SETTINGS_SEARCH_INDEX } from "@/lib/settings/search-index"
import { SECTION_LABEL_KEYS } from "@/lib/settings/sections"

type Translate = (key: string) => string

/**
 * The settings search index in the reader's language. Shared by the settings
 * dialog's search box and the command palette so both find the same things.
 */
export function useSearchableSettings(): SearchableSetting[] {
  const t = useTranslations()
  const settings = useTranslations("Settings")
  const translate = t as unknown as Translate

  return useMemo(
    () =>
      SETTINGS_SEARCH_INDEX.map((entry) => ({
        id: entry.id,
        section: entry.section,
        title: translate(entry.title),
        description: entry.description && translate(entry.description),
        keywords: entry.keywords && translate(entry.keywords),
        sectionLabel: settings(SECTION_LABEL_KEYS[entry.section]),
      })),
    [translate, settings]
  )
}
