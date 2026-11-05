import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

/**
 * A whole-page state the reader lands on instead of the page they asked for:
 * an error, a missing page. One layout for all of them, so the error page,
 * the 404 and the root-layout fallback read as the same app.
 *
 * Takes plain strings rather than reading messages itself, because
 * `global-error.tsx` renders outside the intl provider.
 */
export function StateScreen({
  icon,
  title,
  description,
  action,
}: {
  icon: IconSvgElement
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action && <EmptyContent>{action}</EmptyContent>}
      </Empty>
    </main>
  )
}
