"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { reconcileLocaleCookie } from "@/lib/locale-actions"
import type { AppLocale } from "@/i18n/locale-preference"

/**
 * Reconcile after rendering; Server Components cannot mutate response cookies.
 * The page is rendered in the locale the cookie named, so when the account
 * names another one the cookie is corrected and the page is fetched again in it.
 */
export function LocaleReconciler({ locale }: { locale: AppLocale }) {
  const router = useRouter()

  useEffect(() => {
    reconcileLocaleCookie()
      .then((changed) => {
        if (changed) router.refresh()
      })
      .catch(() => {
        // A failed session/database check must not prevent the current page from
        // rendering; the next authenticated request will resolve from the DB.
      })
  }, [locale, router])

  return null
}
