import { notFound } from "next/navigation"

import { ChatSkeleton } from "@/components/chat/chat-skeleton"
import {
  DevGameLoadError,
  DevGlobalError,
} from "@/components/dev-screen-views"
import { devScreensEnabled, type DevScreenId } from "@/lib/dev-screens"

import HomeLoading from "../../../loading"
import LibraryLoading from "../../../library/loading"
import PricingLoading from "../../../pricing/loading"
import ProfileLoading from "../../../profile/loading"
import PlayLoading from "../../../../games/[id]/play/loading"

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * One screen of the dev gallery (`/dev/screens`), inside the app shell like
 * the real routes. Errors are raised for real, so the real boundaries render
 * them; loading screens are the route's own `loading.tsx`, rendered as the
 * page so they stay on screen.
 */
export default async function DevScreen({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  if (!devScreensEnabled) notFound()

  const { name } = await params

  switch (name as DevScreenId) {
    case "not-found":
      return notFound()
    case "error":
      throw new Error("Dev screen gallery: a page that throws.")
    case "global-error":
      return <DevGlobalError />
    case "game-load-error":
      return <DevGameLoadError />
    case "loading-home":
      return <HomeLoading />
    case "loading-game":
      return <ChatSkeleton />
    case "loading-library":
      return <LibraryLoading />
    case "loading-pricing":
      return <PricingLoading />
    case "loading-profile":
      return <ProfileLoading />
    case "loading-play":
      return (
        <div className="fixed inset-0 z-50">
          <PlayLoading />
        </div>
      )
    default:
      return notFound()
  }
}
