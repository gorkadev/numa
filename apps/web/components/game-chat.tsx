"use client"

import { useState } from "react"

import type { UIMessage } from "ai"
import { PanelRightIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { ChatPreview } from "@/components/chat-preview"
import { ChatThread } from "@/components/chat/chat-thread"
import { GameMenu } from "@/components/game-menu"
import type { GameModelId } from "@/lib/ai/model-catalog"

/**
 * The client boundary for a game: the page stays a server component that only
 * loads the thread, while the split between the conversation and the preview —
 * which is toggled in the browser — lives from here down.
 *
 * The header is rendered here rather than in the page for the same reason: the
 * toggle and the pane it controls have to share one piece of state, and a
 * server component cannot hold it.
 */
export function GameChat({
  gameId,
  title,
  previewToken,
  initialMessages,
  initialSessions,
  initialPrompt,
  initialModelId,
}: {
  gameId: string
  /** The game's name, as the header shows it. */
  title: string
  /**
   * The signed token the preview frame's requests carry, minted on the server so
   * the signing secret never reaches the browser.
   *
   * Its absence is how "no sandbox yet" arrives here: until the chat's first turn
   * provisions one there is nothing to preview and the proxy would only 404, so
   * the pane — and the control that opens it — are left out entirely rather than
   * shown broken.
   */
  previewToken?: string
  initialMessages: UIMessage[]
  initialSessions?: Record<
    string,
    { publicAccessToken: string; lastEventId?: string }
  >
  initialPrompt?: string
  /** The model the home screen's picker was on, when the game came from there. */
  initialModelId?: GameModelId
}) {
  /**
   * The preview's revision, owned here because the two panes are siblings: the
   * thread is the only side that sees the agent's stream, and the preview is
   * the only side that can act on it.
   *
   * It starts at zero — the frame that mounts with the page is already showing
   * whatever the last turn left behind, so the first bump is the first change
   * this session made.
   */
  const [revision, setRevision] = useState(0)

  const [previewOpen, setPreviewOpen] = useState(false)

  /**
   * Whether the preview has ever been opened, which is what decides if the
   * frame exists at all.
   *
   * Two states rather than one because the frame is expensive in both
   * directions. Mounting it on page load starts a WebGL game nobody asked to
   * see; unmounting it on every close means reopening restarts the game from
   * its first frame, losing whatever the player was in the middle of. So
   * nothing loads until the first open, and after that the frame stays mounted
   * and is merely clipped to nothing — toggling then costs nothing and
   * preserves the run.
   */
  const [previewMounted, setPreviewMounted] = useState(false)

  /**
   * A pane with no token to load would only be an empty 60% of the screen, so
   * "open" always has to be read together with "there is something to show".
   */
  const showPreview = previewOpen && Boolean(previewToken)

  function openPreview() {
    setPreviewMounted(true)
    setPreviewOpen(true)
  }

  function closePreview() {
    setPreviewOpen(false)
  }

  return (
    /**
     * Each pane carries its own header, aligned to the same height so the two
     * read as one bar split by the divider.
     *
     * Not one header spanning both: the preview already has a header of its own
     * — it owns the reload and the close — so a bar above both would stack a
     * second one on top of it. Per-pane also keeps each control next to the
     * thing it acts on, and lets the chat's header take the full width whenever
     * the preview is closed without any of it moving.
     */
    <div className="flex h-svh overflow-hidden">
      {/**
       * `min-w-0` is what lets this pane actually shrink. A flex item's default
       * `min-width: auto` is the width of its content, so without it a long
       * unbroken line in the thread would set a floor the preview could never
       * push past — the split would simply refuse to move.
       */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </h1>
          {previewToken ? (
            <Button
              variant="ghost"
              size="icon-sm"
              /**
               * The pressed state is what tells the two headers apart. This
               * control toggles, so it has to show which of the two things it
               * will do next; the preview's own close button only ever closes
               * and needs no such state.
               */
              className="aria-pressed:bg-muted aria-pressed:text-foreground"
              onClick={showPreview ? closePreview : openPreview}
              aria-pressed={showPreview}
            >
              <HugeiconsIcon icon={PanelRightIcon} strokeWidth={2} />
              <span className="sr-only">
                {showPreview ? "Hide preview" : "Show preview"}
              </span>
            </Button>
          ) : null}
          <GameMenu gameId={gameId} title={title} />
        </header>
        <ChatThread
          gameId={gameId}
          initialMessages={initialMessages}
          initialSessions={initialSessions}
          initialPrompt={initialPrompt}
          initialModelId={initialModelId}
          onRevision={setRevision}
        />
      </div>

      {/**
       * The pane is a plain element, not a resizable panel: nothing here needs
       * to be dragged, and a split that only ever takes two values is something
       * CSS can animate on its own.
       *
       * It is padded rather than bordered: the pane holds a floating card, so
       * the separation from the chat is a gap and the card's own hairline, the
       * same way the sidebar sits away from the page on the other edge. The
       * padding costs the slide nothing — `border-box` keeps the element three
       * fifths wide either way, so the negative margin still cancels it exactly.
       *
       * It slides rather than grows. Its width is a constant three fifths and
       * what animates is a negative inline-end margin of the same size, which
       * cancels that width exactly — so when it is closed the element takes up
       * no space in the flex line, sits just past the container's right edge,
       * and is clipped away by the `overflow-hidden` above. Animating the width
       * itself would be the obvious version and is the worse one: the pane's
       * own contents would be re-laid-out on every frame of the transition, and
       * those contents are a running WebGL game.
       *
       * The element is rendered from the very first paint, before the preview
       * has ever been opened, and that is deliberate: a transition needs a
       * previous value to start from, so an element created at the moment of
       * opening would appear at full size instead of sliding in. Only its
       * contents wait for the first open.
       */}
      <div
        className={cn(
          "h-full w-3/5 shrink-0 p-2 transition-[margin] duration-300 ease-out motion-reduce:transition-none",
          showPreview ? "me-0" : "-me-[60%]"
        )}
      >
        {previewMounted && previewToken ? (
          <ChatPreview
            gameId={gameId}
            previewToken={previewToken}
            revision={revision}
            onClose={closePreview}
          />
        ) : null}
      </div>
    </div>
  )
}
