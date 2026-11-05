"use client"

import { useLocale } from "next-intl"

import { GameLoadError } from "@/components/game-route"
import {
  GlobalErrorView,
  type GlobalErrorLocale,
} from "@/components/global-error-view"

/**
 * Client-side states of the dev screen gallery (`/dev/screen/[name]`) that a
 * server page cannot raise for real or cannot hand a callback to.
 */

/**
 * `app/global-error.tsx`'s content. The real one only renders when the root
 * layout itself fails, which no page can cause, so this shows the same view
 * covering the app shell instead.
 */
export function DevGlobalError() {
  const locale = useLocale() as GlobalErrorLocale

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <GlobalErrorView locale={locale} onRetry={() => location.reload()} />
    </div>
  )
}

/** A game whose row could not be read (`GameRoute`). */
export function DevGameLoadError() {
  return <GameLoadError onRetry={() => location.reload()} />
}
