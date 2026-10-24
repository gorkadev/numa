"use client"

import NumberFlow from "@number-flow/react"
import { useLocale } from "next-intl"
import type { ComponentProps } from "react"

/**
 * A number that rolls to its new value instead of jumping.
 *
 * The locale comes from the app's own, so every call site formats like the
 * `Intl` formatters around it. Honours `prefers-reduced-motion` by default (the
 * library's `respectMotionPreference`), so a reader who asked for less motion
 * simply sees the new number.
 */
export function AnimatedNumber(
  props: Omit<ComponentProps<typeof NumberFlow>, "locales">
) {
  const locale = useLocale()

  return <NumberFlow locales={locale} {...props} />
}
