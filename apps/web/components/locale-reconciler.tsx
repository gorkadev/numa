"use client"

import { useEffect } from "react"

import { reconcileLocaleCookie } from "@/lib/locale-actions"
import type { AppLocale } from "@/i18n/locale-preference"

/** Reconcile after rendering; Server Components cannot mutate response cookies. */
export function LocaleReconciler({ locale }: { locale: AppLocale }) {
  useEffect(() => {
    void reconcileLocaleCookie().catch(() => {
      // A failed session/database check must not prevent the current page from
      // rendering; the next authenticated request will resolve from the DB.
    })
  }, [locale])

  return null
}
