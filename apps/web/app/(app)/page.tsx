import Image from "next/image"

import { auth } from "@clerk/nextjs/server"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { NewGameComposer } from "@/components/new-game-composer"
import { suggestions } from "@/lib/games/suggestions"

export default async function Page() {
  await auth.protect()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6">
      <Empty className="flex-none">
        <EmptyHeader>
          <EmptyMedia>
            <Image src="/logo.svg" alt="Numa" width={40} height={48} priority />
          </EmptyMedia>
          <EmptyTitle>What should we build today?</EmptyTitle>
          <EmptyDescription>
            Build your own racers, shooters, puzzles and whole worlds using your
            own words. If you can describe it, you can play it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-3xl gap-6">
          <NewGameComposer />
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion.label}
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground"
              >
                <HugeiconsIcon icon={suggestion.icon} />
                {suggestion.label}
              </Button>
            ))}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
