"use client"

import { useRef, useState, useSyncExternalStore } from "react"

import Link from "next/link"

import {
  ArrowLeft01Icon,
  FullScreenIcon,
  MinimizeScreenIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { ChatPreviewBody } from "@/components/chat-preview"

/** Shared styling for every floating toolbar control, over a game that may be any color. */
const TOOLBAR_BUTTON_CLASS = "shadow-lg backdrop-blur-md"

/** A subscription that never fires: `document.fullscreenEnabled` cannot change under a running tab, but `useSyncExternalStore` still needs one — same shape as `hooks/use-is-mac.ts`'s own `noSubscribe`. */
const noSubscribe = () => () => {}

/**
 * Whether the browser supports the Fullscreen API at all, read through
 * `useSyncExternalStore` rather than a `useState` set from an effect — the
 * server has no `document` to ask, so `false` is the portable snapshot and
 * the client's is whatever `document.fullscreenEnabled` reports, exactly
 * the split `useIsMac` makes for its own platform sniff. iOS Safari is the
 * main reason this check exists: it still reports `false` there, and the
 * full-viewport layout already reads as "fullscreen" without the toggle.
 */
function useFullscreenSupported() {
  return useSyncExternalStore(
    noSubscribe,
    () => document.fullscreenEnabled,
    () => false
  )
}

function subscribeFullscreenChange(onStoreChange: () => void) {
  document.addEventListener("fullscreenchange", onStoreChange)
  return () => document.removeEventListener("fullscreenchange", onStoreChange)
}

/**
 * Whether `container` is the element currently fullscreen — a real
 * subscription this time, to the `fullscreenchange` event, so the toggle's
 * icon and label track the actual state (including an exit triggered by the
 * browser's own chrome or the Esc key, not just this component's button).
 */
function useIsFullscreen(container: React.RefObject<HTMLDivElement | null>) {
  return useSyncExternalStore(
    subscribeFullscreenChange,
    () => document.fullscreenElement === container.current,
    () => false
  )
}

/**
 * The full-viewport counterpart to the docked preview in `SidePanel`: no
 * chat, no sidebar, just the game and a minimal floating toolbar — the shape
 * a player actually wants once they are done iterating and just want to
 * play. Reached at `/games/[id]/play`, a route deliberately kept outside the
 * `(app)` route group so it renders under the root layout alone rather than
 * the app shell's sidebar (see that route's `page.tsx`).
 *
 * Owns none of the state `GameChat` does — no revision tracking, no
 * multi-turn reload coordination — because this view never sees the agent's
 * stream. It mounts `ChatPreviewBody` at a fixed `revision={0}` and drives
 * reloads with its own toolbar button, the same "remount is the reload"
 * mechanism `SidePanel` uses for its own button.
 */
export function GamePlayView({
  gameId,
  gameTitle,
  previewToken,
}: {
  gameId: string
  gameTitle: string
  /** Absent when the game has no sandbox yet — see the route's `page.tsx`. */
  previewToken?: string
}) {
  /** The element the Fullscreen API expands — the whole view, toolbar included, not just the frame. */
  const containerRef = useRef<HTMLDivElement>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const fullscreen = useIsFullscreen(containerRef)
  const fullscreenSupported = useFullscreenSupported()

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void containerRef.current?.requestFullscreen()
    }
  }

  return (
    <div ref={containerRef} className="relative h-svh w-full bg-background">
      {previewToken ? (
        <ChatPreviewBody
          gameId={gameId}
          previewToken={previewToken}
          revision={0}
          reloadKey={reloadKey}
          allowFullScreen
        />
      ) : (
        /**
         * A game whose first turn hasn't landed yet has nothing to embed —
         * `page.tsx` only mints a token once `sandboxId` exists, the same
         * signal `GameChat` uses to decide whether the preview pane exists at
         * all. Showing that as a plain empty state beats a frame pointed at a
         * proxy that has nothing to serve.
         */
        <Empty className="h-full rounded-none border-none">
          <EmptyHeader>
            <EmptyTitle>Nothing to play yet</EmptyTitle>
            <EmptyDescription>
              {gameTitle} hasn&apos;t been built yet. Go back to the chat and
              send a message to get started.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href={`/games/${gameId}`} />}>
              Back to chat
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/**
       * `pointer-events-none` on the row and `pointer-events-auto` on each
       * control: the toolbar floats over a game that wants every pointer and
       * touch event it can get, so only the buttons themselves — not the gaps
       * between them — are allowed to intercept anything.
       */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 sm:p-4">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href={`/games/${gameId}`}
                aria-label="Back to chat"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "icon" }),
                  "pointer-events-auto",
                  TOOLBAR_BUTTON_CLASS
                )}
              />
            }
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent side="bottom">Back to chat</TooltipContent>
        </Tooltip>

        <div className="pointer-events-auto flex items-center gap-2">
          {previewToken ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Reload"
                    onClick={() => setReloadKey((count) => count + 1)}
                    className={TOOLBAR_BUTTON_CLASS}
                  />
                }
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent side="bottom">Reload</TooltipContent>
            </Tooltip>
          ) : null}

          {fullscreenSupported ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={
                      fullscreen ? "Exit fullscreen" : "Enter fullscreen"
                    }
                    onClick={toggleFullscreen}
                    className={TOOLBAR_BUTTON_CLASS}
                  />
                }
              >
                <HugeiconsIcon
                  icon={fullscreen ? MinimizeScreenIcon : FullScreenIcon}
                  strokeWidth={2}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  )
}
