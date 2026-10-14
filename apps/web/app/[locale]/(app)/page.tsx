import Image from "next/image"

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
import { requireSession } from "@/lib/session"
import { getTranslations } from "next-intl/server"

export default async function Page() {
  await requireSession()
  const t = await getTranslations("Home")

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
      <Empty className="flex-none">
        <EmptyHeader>
          <EmptyMedia>
            <Image src="/logo.svg" alt="Numa" width={40} height={48} priority />
          </EmptyMedia>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-3xl">
          <NewGameComposer />
        </EmptyContent>
      </Empty>
    </div>
  )
}
