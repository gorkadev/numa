import type { ComponentProps, ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"

/**
 * The app's `Button` primitive, rendered as a link.
 *
 * Every call to action on the site navigates, so the primitive hands its
 * styles to an anchor through `render`, the same handoff the app makes in
 * `apps/web/components/upgrade-card.tsx`. Astro renders it at build time and
 * never hydrates it: the visitor gets a plain `<a>` carrying the exact classes
 * the app's buttons have.
 */
export function LinkButton({
  href,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "render" | "nativeButton"> & {
  href: string
  children?: ReactNode
}) {
  return (
    <Button nativeButton={false} render={<a href={href} />} {...props}>
      {children}
    </Button>
  )
}
