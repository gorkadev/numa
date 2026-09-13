"use client"

import { useState } from "react"

import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The running game, embedded from this origin.
 *
 * This used to be a full card with its own header — title, reload, close —
 * because it was one of two mutually exclusive docked panes in
 * `game-chat.tsx`. 10c folded both panes into one `SidePanel` (see that
 * file) with a shared tab header, so the card, the title and both buttons
 * moved there; what is left here is only the part `SidePanel` cannot own
 * itself — the iframe and its loading state — rendered as a plain body that
 * drops into whichever container `SidePanel` gives it.
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
export function ChatPreviewBody({
  gameId,
  previewToken,
  revision,
  reloadKey,
  hidden,
  disablePointerEvents,
  className,
  ...props
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
   * Bumped by `SidePanel`'s reload button, which now owns the counter this
   * component used to keep for itself (`reloads` in the pre-10c version) —
   * the button lives in the shared tab header, not in here, so the count it
   * drives has to live wherever the button does.
   */
  reloadKey: number
  /**
   * Set by `SidePanel` while the Agents tab is active, so the frame — and
   * the running game inside it — stays mounted across a tab switch instead
   * of being torn down and rebuilt (see that file's comment on
   * `previewMounted`). A native `hidden` attribute rather than an unmount:
   * `display: none` costs the frame nothing, while removing it from the
   * tree would restart the game exactly the same as closing the panel used
   * to.
   */
  hidden?: boolean
  /**
   * Set by `SidePanel` for the duration of a resize drag. The iframe is a
   * rectangle the browser routes pointer events to directly, so without
   * this a drag that passes over the preview loses every subsequent
   * `pointermove` to the iframe's own document instead of the window
   * listener tracking the width.
   */
  disablePointerEvents?: boolean
} & Omit<React.ComponentPropsWithoutRef<"div">, "hidden" | "children">) {
  /**
   * Remounting is the reload. `src` is identical across updates — the sandbox
   * keeps one preview URL for its whole life — so assigning it again would be a
   * no-op, and reaching into `contentWindow.location` is not available to a
   * frame deliberately kept out of this origin.
   */
  const frameKey = `${revision}:${reloadKey}`

  /**
   * Loading is derived from which frame has reported in, rather than tracked as
   * its own flag. A boolean would have to be flipped back to `true` by whoever
   * caused the remount — the button and the agent both — and forgetting either
   * leaves the spinner hidden while the new frame is blank.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== frameKey

  return (
    <div
      className={cn("relative size-full", className)}
      hidden={hidden}
      {...props}
    >
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-background">
          <Spinner />
        </div>
      )}

      <iframe
        className={cn(
          "size-full border-0",
          disablePointerEvents && "pointer-events-none"
        )}
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
  )
}
