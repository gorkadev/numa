"use client"

import { Alert02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"

import { StateScreen } from "@/components/state-screen"

/**
 * The root-layout fallback's strings. They live here, not in `messages/`,
 * because this renders when the layout that loads the messages has failed.
 */
const COPY = {
  en: {
    title: "Numa could not load",
    description:
      "Something went wrong before the app could start. Please try again.",
    retry: "Try again",
  },
  es: {
    title: "Numa no pudo cargarse",
    description:
      "Algo falló antes de que la app pudiera arrancar. Inténtalo de nuevo.",
    retry: "Intentar de nuevo",
  },
} as const

export type GlobalErrorLocale = keyof typeof COPY

/** The content of `app/global-error.tsx`, also shown in the dev screen gallery. */
export function GlobalErrorView({
  locale,
  onRetry,
}: {
  locale: GlobalErrorLocale
  onRetry: () => void
}) {
  const copy = COPY[locale]

  return (
    <StateScreen
      icon={Alert02Icon}
      title={copy.title}
      description={copy.description}
      action={<Button onClick={onRetry}>{copy.retry}</Button>}
    />
  )
}
