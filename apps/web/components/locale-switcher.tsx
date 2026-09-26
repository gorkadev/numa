"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "@workspace/ui/components/toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { routing } from "@/i18n/routing"
import { setLocalePreference } from "@/lib/locale-actions"

const LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  es: "Español",
}

export function LocaleSwitcher({
  presentation = "labeled",
  describedBy,
}: {
  /** Auth pages keep the visible label; settings supplies its own row content. */
  presentation?: "labeled" | "control-only"
  describedBy?: string
}) {
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

  const select = (
    <Select
      value={locale}
      onValueChange={(value) => {
        if (value) changeLocale(value)
      }}
    >
      <SelectTrigger
        aria-label={t("language")}
        aria-describedby={describedBy}
        className={presentation === "control-only" ? "w-full sm:w-auto" : ""}
        disabled={pending}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((option) => (
          <SelectItem key={option} value={option}>
            {LOCALE_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  if (presentation === "control-only") return select

  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>{t("language")}</span>
      {select}
    </label>
  )
}
