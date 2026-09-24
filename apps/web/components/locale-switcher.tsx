"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "@workspace/ui/components/toast"

import { routing } from "@/i18n/routing"
import { setLocalePreference } from "@/lib/locale-actions"

const LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  es: "Español",
}

export function LocaleSwitcher() {
  const locale = useLocale()
  const t = useTranslations("Shell")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function changeLocale(value: string) {
    startTransition(async () => {
      try {
        await setLocalePreference(value)
        router.refresh()
      } catch {
        toast.add({
          type: "error",
          title: t("couldNotChangeLanguage"),
          description: t("pleaseTryAgain"),
        })
      }
    })
  }

  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>{t("language")}</span>
      <select
        aria-label={t("language")}
        className="rounded-md border border-border bg-background px-3 py-2"
        disabled={pending}
        value={locale}
        onChange={(event) => changeLocale(event.currentTarget.value)}
      >
        {routing.locales.map((option) => (
          <option key={option} value={option}>
            {LOCALE_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  )
}
