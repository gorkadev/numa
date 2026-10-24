import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

const SUMMARY_CELLS = [0, 1, 2, 3]
const STATISTIC_ROWS = [0, 1, 2]

/**
 * The profile fallback, mirroring `ProfilePage` block for block.
 *
 * Measured anchors: the 56px sticky header (`h-14` + `px-4`), the 80px avatar
 * (`size-20`), the `text-2xl` name line (32), the default-size email line (24)
 * and the `text-sm` handle (20), a stats strip that spans the content width
 * with four equal columns holding a 28px value and a 20px label, and two
 * detail cards that share a `md:grid-cols-2` row at the card primitive's 24px
 * radius.
 *
 * The activity calendar is part of the page's height, so its footprint is
 * mirrored too as one block: 52 weeks and seven rows of ten-pixel cells with
 * the heatmap's two-pixel gap (622 x 82), scrolling the same way at narrow
 * widths.
 */
export default function Loading() {
  return (
    <main className="w-full min-w-0">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1 px-4">
        <MobileSidebarTrigger className="-ms-1.5" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-24 max-w-full" />
        </div>
        <Skeleton className="h-7 w-16" />
      </header>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-col items-center">
            <Skeleton className="h-8 w-48 max-w-full" />
            <Skeleton className="h-6 w-56 max-w-full" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card md:grid-cols-4">
          {SUMMARY_CELLS.map((cell) => (
            <div key={cell} className="min-w-0 p-3 text-center">
              <Skeleton className="mx-auto h-7 w-10" />
              <Skeleton className="mx-auto h-5 w-14" />
            </div>
          ))}
        </div>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-7 w-24" />
            <div className="flex w-fit items-center gap-0.5">
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-24" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="flex w-fit flex-col gap-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-[82px] w-[622px] rounded-xs" />
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Skeleton className="h-6 w-32" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-40" />
              {STATISTIC_ROWS.map((row) => (
                <div
                  key={row}
                  className="flex justify-between gap-4 border-b pb-2 last:border-0"
                >
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Skeleton className="h-6 w-36" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex flex-col gap-1 rounded-lg border p-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-32" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
