"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"

import {
  GlobalErrorView,
  type GlobalErrorLocale,
} from "@/components/global-error-view"
import { fontMono, inter } from "@/lib/fonts"

/**
 * Applies the theme `next-themes` stored (`components/theme-provider.tsx`),
 * since its provider lives in the layout this page replaces. Run inline for a
 * server-rendered failure, so the first paint is already in the right theme,
 * and again from an effect for one that happens after the app has loaded,
 * where React inserts this script without running it.
 */
function applyTheme() {
  try {
    const stored = localStorage.getItem("theme")
    const dark =
      stored === "dark" ||
      ((!stored || stored === "system") &&
        matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.classList.toggle("dark", dark)
  } catch {
    // Storage can be blocked; the light theme is the fallback.
  }
}

/** The locale the app last used (`NEXT_LOCALE`), else the browser's. */
function readLocale(): GlobalErrorLocale {
  const cookie = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)?.[1]
  const preferred = cookie ?? navigator.language
  return preferred.toLowerCase().startsWith("es") ? "es" : "en"
}

const noSubscription = () => () => {}

/**
 * Replaces the root layout when it fails, so it brings its own document,
 * styles, fonts and theme. See `error.md` → Global Error in the bundled
 * Next.js docs.
 */
export default function GlobalError({
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  const locale = useSyncExternalStore<GlobalErrorLocale>(
    noSubscription,
    readLocale,
    () => "en"
  )

  useLayoutEffect(() => {
    applyTheme()
  }, [])

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("antialiased font-sans", fontMono.variable, inter.variable)}
    >
      <head>
        <title>Numa</title>
        <script dangerouslySetInnerHTML={{ __html: `(${applyTheme})()` }} />
      </head>
      <body>
        <GlobalErrorView locale={locale} onRetry={retry} />
      </body>
    </html>
  )
}
