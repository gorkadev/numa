import "blobatar/motion.css"
import "blobatar/gaze.css"

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
import { NewGameAvatar } from "@/components/new-game-avatar"
import { readGameSettings } from "@/lib/settings/game-settings"
import { getTranslations } from "next-intl/server"

export default async function Page() {
  const [t, { defaultTierId }] = await Promise.all([
    getTranslations("Home"),
    readGameSettings(),
  ])

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
      <Empty className="flex-none">
        <EmptyHeader>
          <EmptyMedia>
            <NewGameAvatar />
          </EmptyMedia>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-3xl">
          <NewGameComposer defaultTierId={defaultTierId} />
        </EmptyContent>
      </Empty>
    </div>
  )
}
