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
  ...props
}: Omit<React.ComponentProps<"svg">, "width" | "height" | "strokeWidth">) {
  return (
    <HugeiconsIcon
      icon={LoaderCircleIcon}
      strokeWidth={2}
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
