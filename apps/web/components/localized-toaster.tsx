"use client"

import { Toaster } from "@workspace/ui/components/toast"
import { useTranslations } from "next-intl"

export function LocalizedToaster({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Common")

  return <Toaster closeLabel={t("closeToast")}>{children}</Toaster>
}
