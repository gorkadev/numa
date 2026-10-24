import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

/**
 * The home hero's geometry, measured from the loaded `Empty` at 375/768/1280:
 * an 84px media slot, one `text-lg` title line, three `text-sm` description
 * lines (68.2 in total), then a 768x112 composer surface followed by two rows
 * of 28px suggestion chips, 24px below it.
 *
 * Built from the same `Empty` parts the page renders so the padding, radius,
 * header gap and `max-w-3xl` content width come from the primitive. The
 * composer is the one block with no server-safe primitive behind it —
 * `InputGroup` is a client component — so this mirrors its classes instead:
 * `rounded-2xl` (18px) over `bg-input/50`, a control area and a 46px addon
 * row. The control is 64 high above `md` and 72 below it, because the real
 * textarea switches to the 16px mobile font size and grows with its line:
 * measured 112 tall at 768/1280 and 120 at 375.
 */
export default function Loading() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
      <Empty className="flex-none">
        <EmptyHeader className="w-full">
          <EmptyMedia>
            <Skeleton className="size-21 rounded-full" />
          </EmptyMedia>
          <EmptyTitle>
            <Skeleton className="h-7 w-64 max-w-full" />
          </EmptyTitle>
          <EmptyDescription className="flex w-full flex-col items-center gap-1">
            <Skeleton className="h-5 w-full max-w-md" />
            <Skeleton className="h-5 w-4/5 max-w-sm" />
            <Skeleton className="h-5 w-3/5 max-w-xs" />
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-3xl">
          <div className="flex w-full flex-col gap-6">
            <div className="flex w-full flex-col rounded-2xl border border-transparent bg-input/50">
              <div className="flex h-18 items-start px-3 py-3 md:h-16">
                <Skeleton className="h-5 w-2/5" />
              </div>
              <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-2">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="ml-auto size-8 rounded-full" />
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-7 w-36" />
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-7 w-44" />
            </div>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
