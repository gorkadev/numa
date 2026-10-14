import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

export default function Loading() {
  return (
    <div className="flex h-svh overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <MobileSidebarTrigger className="-ms-1.5" />
          <Skeleton className="h-4 w-40" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-4 py-6">
          <div className="max-w-2xl space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
          <div className="ml-auto w-full max-w-2xl space-y-3">
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="ml-auto h-24 w-4/5 rounded-2xl" />
          </div>
          <div className="mt-auto rounded-xl border p-3">
            <Skeleton className="h-12 w-full" />
            <div className="mt-3 flex justify-end">
              <Skeleton className="size-9" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
