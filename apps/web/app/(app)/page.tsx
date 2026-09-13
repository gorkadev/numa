import Image from "next/image"

import { auth } from "@clerk/nextjs/server"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import { NewGameComposer } from "@/components/new-game-composer"

export default async function Page() {
  await auth.protect()

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
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
        <EmptyContent className="max-w-3xl">
          <NewGameComposer />
        </EmptyContent>
      </Empty>
    </div>
  )
}
