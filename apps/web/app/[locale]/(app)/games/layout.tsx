import { Suspense } from "react"
import { connection } from "next/server"

import { GameRoute } from "@/components/game-route"
import { strongContextWindows } from "@/lib/ai/model-registry"

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * The chat lives here rather than in the page because a layout survives moving
 * between games. Everything under `(app)` renders per request, so each move
 * still costs a server round trip, and `[id]`'s segment is new on every one: a
 * chat inside it would wait for that response behind `loading.tsx`. Up here the
 * chat follows the id as soon as the router commits, and the response has
 * nothing left to change.
 *
 * `renderedAt` is how a server refresh still reaches the game's row. Renaming,
 * pinning and changing a setting all end in a refresh, and a new value here is
 * the only thing such a refresh can change.
 */
export default function GamesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* TODO: Cache Components adoption. Added to unblock the build: remove this boundary to re-trigger the error and review the documented options. */}
      <Suspense fallback={null}>
        <FreshGameRoute />
      </Suspense>
      {children}
    </>
  )
}

async function FreshGameRoute() {
  await connection()

  return (
    <GameRoute
      contextWindows={strongContextWindows()}
      renderedAt={crypto.randomUUID()}
    />
  )
}
