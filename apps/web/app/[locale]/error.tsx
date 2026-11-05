"use client"

import { Alert02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"

import { StateScreen } from "@/components/state-screen"

export default function Error({
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  const t = useTranslations("Errors")

  return (
    <StateScreen
      icon={Alert02Icon}
      title={t("title")}
      description={t("description")}
      action={<Button onClick={retry}>{t("retry")}</Button>}
    />
  )
}
