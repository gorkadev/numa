"use client"

import { Spinner as BaseSpinner } from "@workspace/ui/components/spinner"
import { useTranslations } from "next-intl"

type LocalizedSpinnerProps = Omit<
  React.ComponentProps<"svg">,
  "width" | "height" | "strokeWidth"
> & {
  /** Announces this contextual loading state unless the spinner is decorative. */
  label?: string
  /** Hides a nested spinner when its parent already supplies the status. */
  decorative?: boolean
}

export function Spinner({
  label,
  decorative,
  ...props
}: LocalizedSpinnerProps) {
  const t = useTranslations("Common")

  return (
    <BaseSpinner
      {...props}
      label={label ?? t("loading")}
      decorative={decorative}
    />
  )
}
