import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

function PlanCardSkeleton() {
  return (
    <div className="rounded-xl border p-6">
      <Skeleton className="h-5 w-16" />
      <Skeleton className="mt-4 h-8 w-28" />
      <Skeleton className="mt-3 h-5 w-full" />
      <Skeleton className="mt-2 h-5 w-4/5" />
      <Skeleton className="mt-6 h-9 w-full" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
      <div className="flex flex-col items-center gap-3 py-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <PlanCardSkeleton />
        <PlanCardSkeleton />
        <PlanCardSkeleton />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <PlanCardSkeleton />
        <PlanCardSkeleton />
        <PlanCardSkeleton />
      </div>
      <div className="space-y-4 rounded-xl border p-4">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    </div>
  )
}
