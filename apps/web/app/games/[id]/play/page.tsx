import { cache } from "react"

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { GamePlayView } from "@/components/game-play-view"
import { signPreviewToken } from "@/lib/games/preview-token"
import { getGame } from "@/lib/games/queries"

/**
 * Deliberately outside the `(app)` route group: `/games/[id]` there renders
 * inside `AppLayout`'s `SidebarProvider`, and this route wants none of
 * that — a full-viewport play surface, not a docked pane next to a
 * sidebar. Route groups only fold into the URL for organization, so a
 * segment outside every group (`app/games/[id]/play`) still resolves to
 * `/games/[id]/play`, a path distinct from `/games/[id]` and therefore not
 * the "conflicting paths" case Next.js's own route-group docs warn about —
 * it composes with the root `app/layout.tsx` alone.
 *
 * `getGame` is called from both `generateMetadata` and this component for
 * the same request; wrapping it in `cache()` is what keeps that down to one
 * database round trip instead of two.
 */
const loadGame = cache((id: string) => getGame(id))

export async function generateMetadata({
  params,
}: PageProps<"/games/[id]/play">): Promise<Metadata> {
  const { id } = await params
  const game = await loadGame(id)

  return { title: game ? `Play · ${game.title}` : "Play" }
}

export default async function PlayPage({
  params,
}: PageProps<"/games/[id]/play">) {
  const { id } = await params

  /**
   * Same owner-scoped lookup `app/(app)/games/[id]/page.tsx` uses: a game
   * that does not exist and one owned by someone else are indistinguishable
   * here, both a 404, because `getGame` folds the tenant boundary into the
   * query itself rather than checking it afterwards.
   */
  const game = await loadGame(id)

  if (!game) notFound()

  /**
   * Mirrors the chat page's own rule exactly: no sandbox yet means nothing
   * to preview, so no token is minted and `GamePlayView` renders its empty
   * state instead of a frame pointed at a proxy with nothing to serve.
   */
  const previewToken = game.sandboxId ? signPreviewToken(game.id) : undefined

  return (
    <GamePlayView
      gameId={game.id}
      gameTitle={game.title}
      previewToken={previewToken}
    />
  )
}
