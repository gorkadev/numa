import { Skeleton } from "@workspace/ui/components/skeleton"

export default function Loading() {
  return (
    <div className="relative h-svh w-full bg-background">
      <Skeleton className="h-full w-full rounded-none" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        <Skeleton className="size-10 rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="size-10 rounded-md" />
          <Skeleton className="size-10 rounded-md" />
        </div>
      </div>
    </div>
  )
}
