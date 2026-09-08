"use client"

import { useState } from "react"

import { RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

/**
 * The running game, embedded from this origin.
 *
 * The iframe points at the app's own proxy rather than at the sandbox's preview
 * URL, so the preview token stays on the server and the frame inherits the
 * game's org-scoped authorization. The trailing slash matters: it makes the
 * proxy path a directory, so a relative `./style.css` inside the game resolves
 * back through the proxy instead of escaping to the app's root.
 */
export function ChatPreview({
  gameId,
  revision,
}: {
  gameId: string
  /**
   * The last revision the agent reported, which changes only on a turn that
   * wrote to the sandbox. Every distinct value the frame is handed remounts it
   * exactly once, so a repeated one — what a reconnecting tab can see — leaves
   * a running game alone.
   */
  revision: number
}) {
  /**
   * Remounting is the reload. `src` is identical across updates — the sandbox
   * keeps one preview URL for its whole life — so assigning it again would be a
   * no-op, and reaching into `contentWindow.location` is not available to a
   * frame deliberately kept out of this origin.
   */
  const [reloads, setReloads] = useState(0)
  const frameKey = `${revision}:${reloads}`

  /**
   * Loading is derived from which frame has reported in, rather than tracked as
   * its own flag. A boolean would have to be flipped back to `true` by whoever
   * caused the remount — the button and the agent both — and forgetting either
   * leaves the spinner hidden while the new frame is blank.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== frameKey

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="truncate text-xs text-muted-foreground">Preview</span>
        <Button
          aria-label="Reload preview"
          onClick={() => setReloads((count) => count + 1)}
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon icon={RefreshIcon} />
        </Button>
      </div>

      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-background">
            <Spinner />
          </div>
        )}

        <iframe
          className="size-full border-0"
          key={frameKey}
          onLoad={() => setLoadedKey(frameKey)}
          /**
           * The game is model-generated code. `allow-scripts` is what makes it
           * playable, but it is deliberately not paired with `allow-same-origin`:
           * together they would let the frame reach this app's origin — its
           * cookies and storage — and take the sandbox down with it.
           */
          sandbox="allow-scripts allow-forms allow-pointer-lock"
          src={`/api/games/${gameId}/preview/`}
          title="Game preview"
        />
      </div>
    </div>
  )
}
