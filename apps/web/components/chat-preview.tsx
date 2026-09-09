"use client"

import { useState } from "react"

import { Cancel01Icon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

/**
 * The running game, embedded from this origin.
 *
 * The iframe points at the app's own proxy rather than at the sandbox's preview
 * URL, so the sandbox's own token stays on the server.
 *
 * Authorization travels in the path because the frame cannot send a cookie: it
 * is sandboxed onto an opaque origin, and a module script fetched from a null
 * origin carries no credentials, so `./game.js` would reach the proxy anonymous.
 * A signed token in a path segment survives that — relative resolution keeps the
 * directory prefix, so every file the game asks for stays authorized without the
 * game knowing the token exists. A query string would not: resolution drops it.
 *
 * The entry point is spelled out as `index.html` rather than left as a bare
 * directory: Next normalizes `trailingSlash: false`, so a `/preview/` src is
 * 308-redirected to `/preview`, and the frame's base URL loses its last segment.
 * A relative `./game.js` would then resolve to `/api/games/<id>/game.js` — off
 * the proxy entirely, and a 404. Naming the file keeps the directory in the base
 * without asking Next for a redirect.
 */
export function ChatPreview({
  gameId,
  previewToken,
  revision,
  onClose,
}: {
  gameId: string
  previewToken: string
  /**
   * The last revision the agent reported, which changes only on a turn that
   * wrote to the sandbox. Every distinct value the frame is handed remounts it
   * exactly once, so a repeated one — what a reconnecting tab can see — leaves
   * a running game alone.
   */
  revision: number
  /**
   * Collapses the pane. One-way on purpose: the chat header's control toggles,
   * this one only closes, so it is unambiguous from inside a pane that is
   * already open.
   */
  onClose: () => void
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
    /**
     * A card rather than a full-bleed pane, matching the floating sidebar on the
     * other edge of the screen: the same rounding, hairline and shadow, so the
     * page reads as a conversation with two things floating either side of it.
     *
     * `overflow-hidden` is doing real work here and not just tidiness — the
     * iframe is a rectangle that knows nothing about this container, so the
     * rounded corners exist only because the parent clips them.
     */
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      {/**
       * The same height as the chat pane's header, stated rather than left to
       * the card's contents: the two sit either side of the gap and read as one
       * bar, so a few pixels of drift between them is visible.
       */}
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h1 className="truncate text-sm font-medium">Preview</h1>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label="Reload preview"
            onClick={() => setReloads((count) => count + 1)}
            size="icon-sm"
            variant="ghost"
          >
            <HugeiconsIcon icon={RefreshIcon} />
          </Button>
          <Button
            aria-label="Close preview"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </div>
      </header>

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
          src={`/api/games/${gameId}/preview/${previewToken}/index.html`}
          title="Game preview"
        />
      </div>
    </div>
  )
}
