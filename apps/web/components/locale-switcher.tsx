"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "@workspace/ui/components/toast"
import {
  Select,
  SelectContent,
  SelectGroup,
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

const items = routing.locales.map((locale) => ({
  value: locale,
  label: LOCALE_LABELS[locale],
}))

export function LocaleSwitcher({
  describedBy,
}: {
  /** Auth pages keep the visible label; settings supplies its own row content. */
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

  return(
    <Select
      value={locale}
      onValueChange={(value) => {
        if (value) changeLocale(value)
      }}
    items={items}
    >
      <SelectTrigger
        aria-label={t("language")}
        aria-describedby={describedBy}
        disabled={pending}
        className="w-full sm:w-auto"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
