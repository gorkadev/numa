import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

const CARDS = [0, 1, 2, 3, 4, 5, 6, 7]

/** The library's frame: title bar and toolbar fixed, the grid below. */
export default function Loading() {
  return (
    <main className="flex h-svh w-full min-w-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-4">
        <MobileSidebarTrigger className="-ms-1.5" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-24 max-w-full" />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl shrink-0 flex-wrap items-center gap-3 px-4 pt-2 pb-4 md:px-8">
        <Skeleton className="h-8 w-56 rounded-2xl" />
        <div className="ms-auto flex items-center gap-2">
          <Skeleton className="h-8 w-full sm:w-64" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4">
          {CARDS.map((card) => (
            <Skeleton key={card} className="aspect-[4/3.6] rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  )
}
