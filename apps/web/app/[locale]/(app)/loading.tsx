import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

export default function Loading() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 px-6">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex w-full max-w-xl flex-col items-center gap-3">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-5 w-full max-w-md" />
          <Skeleton className="h-5 w-4/5 max-w-sm" />
        </div>
        <div className="w-full rounded-xl border p-4">
          <Skeleton className="h-24 w-full" />
          <div className="mt-3 flex justify-end">
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
    </div>
  )
}
