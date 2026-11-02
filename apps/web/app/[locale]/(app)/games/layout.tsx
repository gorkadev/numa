import { GameRoute } from "@/components/game-route"
import { strongContextWindows } from "@/lib/ai/model-registry"

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
      <GameRoute
        contextWindows={strongContextWindows()}
        renderedAt={crypto.randomUUID()}
      />
      {children}
    </>
  )
}
