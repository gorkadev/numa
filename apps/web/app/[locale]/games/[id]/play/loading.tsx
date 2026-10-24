import { Skeleton } from "@workspace/ui/components/skeleton"

/**
 * The play surface, measured from `GamePlayView`: a full-viewport canvas with
 * a floating toolbar inset 16px from the top edge and 32x32 controls.
 *
 * The 32 is the `size="icon"` button the real toolbar renders, and `p-4` is
 * its own `sm` inset — pinned to `p-4` at every width because the 16px inset
 * is what was measured, not the narrower phone fallback.
 */
export default function Loading() {
  return (
    <div className="relative h-svh w-full bg-background">
      <Skeleton className="h-full w-full rounded-none" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        <Skeleton className="size-8" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
        </div>
      </div>
    </div>
  )
}
