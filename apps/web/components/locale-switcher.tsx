"use client"

import { useLocale } from "next-intl"
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
          title: "Could not change language",
          description: "Please try again.",
        })
      }
    })
  }

  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>Language</span>
      <select
        aria-label="Language"
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
