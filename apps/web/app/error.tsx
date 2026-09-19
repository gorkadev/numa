"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            We could not load this page. Please try again.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={unstable_retry}>Try again</Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
