import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { LoaderCircleIcon } from "@hugeicons/core-free-icons"

/**
 * `HugeiconsIcon` types `width`, `height` and `strokeWidth` as numbers only,
 * while the intrinsic `svg` props also allow their string forms, so they are
 * omitted rather than forwarded — the size is set through `className` and the
 * stroke width is fixed below.
 */
function Spinner({
  className,
  label = "Loading",
  decorative = false,
  ...props
}: Omit<React.ComponentProps<"svg">, "width" | "height" | "strokeWidth"> & {
  /** Announces this contextual loading state unless the spinner is decorative. */
  label?: string
  /** Hides a nested spinner when its parent already supplies the status. */
  decorative?: boolean
}) {
  return (
    <HugeiconsIcon
      icon={LoaderCircleIcon}
      strokeWidth={2}
      data-slot="spinner"
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "status", "aria-label": label })}
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Spinner }
