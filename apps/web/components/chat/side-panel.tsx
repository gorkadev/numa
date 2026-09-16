"use client"

import { useState, useSyncExternalStore } from "react"

import Link from "next/link"

import {
  Cancel01Icon,
  RefreshIcon,
  SquareArrowUpRightIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import { ItemGroup } from "@workspace/ui/components/item"
import { Spinner } from "@workspace/ui/components/spinner"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"

import { ChatPreviewBody } from "@/components/chat-preview"
import {
  SubagentPanelBody,
  SubagentRunRow,
} from "@/components/chat/subagent-panel"
import { SubagentRunDetail } from "@/components/chat/subagent-run-detail"
import type { SubagentRunRecord } from "@/lib/games/harness/records"

export type SidePanelTab = "preview" | "agents"

/** Where a dragged width is remembered — see the block comment above `useStoredWidth` for why a per-viewer default belongs here and not in a column. */
const WIDTH_STORAGE_KEY = "numa:side-panel-width"

const DEFAULT_WIDTH_PERCENT = 60
const MIN_WIDTH_PERCENT = 30
const MAX_WIDTH_PERCENT = 75

function clampWidth(percent: number): number {
  return Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, percent))
}

/**
 * The listeners `useSyncExternalStore` hands `useStoredWidth`, kept
 * module-wide for the same reason `upgrade-card.tsx`'s own `listeners` set
 * is: `persistWidth` is the only writer, so it is also the only thing that
 * needs to wake every mounted panel back up.
 */
const widthListeners = new Set<() => void>()

function subscribeWidth(onStoreChange: () => void) {
  widthListeners.add(onStoreChange)
  return () => {
    widthListeners.delete(onStoreChange)
  }
}

/**
 * Reads the stored width as a stable number, falling back to the default the
 * moment anything about the read goes wrong — no value, not a number, or a
 * private window/blocked site data throwing outright.
 */
function readStoredWidth(): number {
  try {
    const stored = window.localStorage.getItem(WIDTH_STORAGE_KEY)
    const parsed = stored === null ? NaN : Number(stored)
    return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH_PERCENT
  } catch {
    return DEFAULT_WIDTH_PERCENT
  }
}

/** The server has no `localStorage` to read, so its snapshot is always the default; the real width applies once the client's own snapshot takes over. */
function readStoredWidthOnServer(): number {
  return DEFAULT_WIDTH_PERCENT
}

function persistWidth(percent: number) {
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(percent))
  } catch {
    /** The width still applies for this render, it just won't stick around for the next visit. */
  }
  for (const listener of widthListeners) listener()
}

/**
 * The panel's settled width as a percentage of the layout it is docked in,
 * read from `localStorage` through `useSyncExternalStore` rather than a
 * `useState` seeded by an effect — the same choice `upgrade-card.tsx` makes
 * for its own dismissal flag, and for the same reason: an effect that reads
 * an external value and immediately calls `setState` is exactly the
 * cascading-render pattern `useSyncExternalStore` exists to replace, and it
 * gets the server-safe default for free through `getServerSnapshot` instead
 * of a component-side "am I hydrated yet" check.
 *
 * This is the width between drags, not during one — `SidePanel` layers an
 * ephemeral local override on top of it while the pointer is down (see
 * `dragWidth` there) so a pixel-by-pixel drag never spams `localStorage`.
 */
function useStoredWidth(): [number, (percent: number) => void] {
  const width = useSyncExternalStore(
    subscribeWidth,
    readStoredWidth,
    readStoredWidthOnServer
  )

  return [width, persistWidth]
}

/**
 * The list-and-detail body for the Agents tab at desktop width, shown only
 * once the container is wide enough to hold both columns side by side (see
 * the `@2xl:` container-query breakpoint below, chosen because it is
 * comfortably under the panel's 60% default width but past its 30% minimum
 * — so the layout that actually ships by default is the wide one, and the
 * narrow one is there for a reader who has dragged the panel thin).
 *
 * Below that breakpoint this renders `SubagentPanelBody` unchanged — the
 * same list-then-detail-with-a-back-button flow the mobile `Drawer` in
 * `subagent-panel.tsx` uses — rather than a second implementation of the
 * same idea. Both bodies are mounted at once and picked between with
 * `hidden`/`@2xl:hidden` purely in CSS: nothing here re-fetches or resets on
 * a resize, because neither body owns any state a remount would lose (the
 * caller owns `selectedRunId`).
 */
function AgentsTabBody({
  records,
  selectedRunId,
  onSelectRun,
}: {
  records: SubagentRunRecord[]
  selectedRunId: string | null
  onSelectRun: (agentId: string | null) => void
}) {
  const selected =
    records.find((record) => record.agentId === selectedRunId) ?? null

  return (
    <>
      <SubagentPanelBody
        records={records}
        selected={selected}
        onSelectRun={onSelectRun}
        className="px-3 pt-3 pb-3 @2xl:hidden"
      />
      <div className="hidden min-h-0 flex-1 @2xl:flex">
        <div className="no-scrollbar w-64 shrink-0 scroll-fade overflow-y-auto overscroll-contain border-e p-2">
          <ItemGroup>
            {records.map((record) => (
              <SubagentRunRow
                key={record.agentId}
                record={record}
                selected={record.agentId === selectedRunId}
                onSelect={onSelectRun}
              />
            ))}
          </ItemGroup>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 scroll-fade overflow-y-auto overscroll-contain p-4">
          {selected ? (
            <SubagentRunDetail record={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a run to see its details.
            </p>
          )}
        </div>
      </div>
    </>
  )
}

const tabTriggerClassName =
  "shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-muted aria-selected:text-foreground"

export type SidePanelProps = {
  gameId: string
  /** See `game-chat.tsx`'s own doc comment on this prop — the token's absence is how "no sandbox yet" is represented, and it hides the Preview tab entirely rather than showing it broken. */
  previewToken?: string
  /** Lazy-mount flag for the preview frame, owned by `game-chat.tsx` for the same reason it owned it before 10c: see that file's comment on `previewMounted`. */
  previewMounted: boolean
  revision: number
  subagentRuns: SubagentRunRecord[]
  selectedRunId: string | null
  onSelectRun: (agentId: string | null) => void
  open: boolean
  activeTab: SidePanelTab
  onActiveTabChange: (tab: SidePanelTab) => void
  onClose: () => void
  /**
   * The flex row this panel is docked in, so a drag can read its pixel width
   * once and turn a pointer delta into a percentage of it — see `onDragStart`
   * below. A ref rather than `window.innerWidth`: nothing here should assume
   * the panel is the only thing sharing that row's width with the chat.
   */
  layoutRef: React.RefObject<HTMLDivElement | null>
}

/**
 * The single docked pane on the right side of `game-chat.tsx`, replacing
 * what used to be two of them — a preview pane and a `SubagentPanel` pane,
 * each sliding in from the same edge and mutually exclusive. Two panes that
 * share one edge cannot actually be exclusive during their own transition,
 * though: closing one and opening the other means both are mid-slide at
 * once, and for 300ms the reader sees them animate past each other. One
 * shell with two tabs has no such moment — the shell's own open/close slide
 * is the only thing that ever animates, and switching tabs only swaps what
 * is inside it.
 *
 * Rendered from first paint, exactly like the two panes it replaces: a
 * slide transition needs a previous value to start from, so an element
 * created at the moment of opening would appear at full size instead of
 * sliding in. Only the preview frame's own mount is still deferred to the
 * first time its tab is opened (`previewMounted`), because mounting it
 * immediately would start a WebGL game nobody asked to see yet.
 *
 * Desktop only below `Mobile`'s own early return: on a narrow viewport the
 * Agents tab has nowhere to go here (it lives in `SubagentPanel`'s bottom
 * `Drawer` instead, opened independently by `game-chat.tsx`), so this
 * component's mobile shape is its own bottom `Drawer` — see
 * `MobilePreviewDrawer` below.
 */
export function SidePanel({
  gameId,
  previewToken,
  previewMounted,
  revision,
  subagentRuns,
  selectedRunId,
  onSelectRun,
  open,
  activeTab,
  onActiveTabChange,
  onClose,
  layoutRef,
}: SidePanelProps) {
  const isMobile = useIsMobile()
  const [storedWidth, persistWidth] = useStoredWidth()
  const [dragging, setDragging] = useState(false)
  /**
   * A drag's live position, held here rather than pushed into
   * `useStoredWidth` on every `pointermove` — that would mean a
   * `localStorage.setItem` call per pixel of motion. `null` outside a drag,
   * which is when `widthPercent` below falls back to the settled stored
   * value.
   */
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const widthPercent = dragWidth ?? storedWidth
  const [reloadKey, setReloadKey] = useState(0)

  const hasRuns = subagentRuns.length > 0
  const runningCount = subagentRuns.filter(
    (run) => run.status === "running"
  ).length

  /**
   * Dragging the handle at the panel's inline-start edge left (toward the
   * chat) makes the panel wider; dragging it right shrinks it. The math
   * below assumes left-to-right layout — a fully bidi-aware version would
   * flip the sign under `dir="rtl"` — while the surrounding classes still
   * use logical properties (`ms-`/`me-`) so the rest of the shell's layout
   * does not regress if that is ever added.
   */
  function onDragStart(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthPercent
    const layoutWidth =
      layoutRef.current?.getBoundingClientRect().width ?? window.innerWidth
    const previousUserSelect = document.body.style.userSelect
    let latestWidth = startWidth

    setDragging(true)
    document.body.style.userSelect = "none"

    function onMove(moveEvent: PointerEvent) {
      const deltaPercent = ((startX - moveEvent.clientX) / layoutWidth) * 100
      latestWidth = clampWidth(startWidth + deltaPercent)
      setDragWidth(latestWidth)
    }

    function onUp() {
      setDragging(false)
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setDragWidth(null)
      persistWidth(latestWidth)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  function onHandleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = 2
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      persistWidth(clampWidth(widthPercent + step))
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      persistWidth(clampWidth(widthPercent - step))
    }
  }

  if (isMobile) {
    return (
      <MobilePreviewDrawer
        open={open && activeTab === "preview"}
        gameId={gameId}
        previewToken={previewToken}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose()
        }}
      />
    )
  }

  return (
    <div
      /**
       * Off-screen while closed, but still mounted — `inert` keeps its
       * controls out of tab order and assistive-tech reach until it slides
       * back in; `aria-hidden` alongside it covers browsers where `inert`
       * does not yet imply it.
       */
      inert={!open}
      aria-hidden={!open}
      style={
        { "--side-panel-width": `${widthPercent}%` } as React.CSSProperties
      }
      className={cn(
        "relative h-full w-(--side-panel-width) shrink-0 p-2 transition-[margin,visibility] duration-300 ease-out motion-reduce:transition-none",
        dragging && "transition-none",
        open ? "me-0" : "invisible -me-(--side-panel-width)"
      )}
    >
      {/**
       * The hit area is wider than the visible line so it stays easy to
       * grab; the line itself only appears on hover/focus/drag so the panel
       * does not carry a permanent seam down its edge.
       */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        aria-valuenow={Math.round(widthPercent)}
        aria-valuemin={MIN_WIDTH_PERCENT}
        aria-valuemax={MAX_WIDTH_PERCENT}
        tabIndex={0}
        onPointerDown={onDragStart}
        onKeyDown={onHandleKeyDown}
        /**
         * `inset-s-0` is the logical (`inset-inline-start`) edge; the
         * `-translate-x-1/2` that centers the hit area on it is a physical
         * transform, same LTR assumption as `onDragStart`'s math above.
         */
        className="group inset-s-0 absolute inset-y-2 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none"
      >
        <div
          className={cn(
            "mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-border",
            dragging && "bg-foreground/40"
          )}
        />
      </div>

      <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        <header className="flex h-10 shrink-0 items-center gap-1 px-2">
          <div
            role="tablist"
            aria-label="Side panel"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {previewToken ? (
              <button
                type="button"
                role="tab"
                id="side-panel-tab-preview"
                aria-selected={activeTab === "preview"}
                aria-controls="side-panel-panel-preview"
                className={tabTriggerClassName}
                onClick={() => onActiveTabChange("preview")}
              >
                Preview
              </button>
            ) : null}
            {hasRuns ? (
              <button
                type="button"
                role="tab"
                id="side-panel-tab-agents"
                aria-selected={activeTab === "agents"}
                aria-controls="side-panel-panel-agents"
                className={cn(
                  tabTriggerClassName,
                  "inline-flex items-center gap-1.5"
                )}
                onClick={() => onActiveTabChange("agents")}
              >
                Agents
                {runningCount > 0 ? (
                  <Spinner className="size-3" />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {subagentRuns.length}
                  </span>
                )}
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {activeTab === "preview" && previewToken ? (
              <>
                <Button
                  aria-label="Reload preview"
                  onClick={() => setReloadKey((count) => count + 1)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={RefreshIcon} />
                </Button>
                {/**
                 * Opens the same game in `/games/[id]/play` — the
                 * full-viewport route this docked pane has no room to become
                 * itself. A new tab, not a navigation of this one: the chat
                 * underneath stays exactly where the reader left it.
                 */}
                <Button
                  aria-label="Open in full-screen play view"
                  render={
                    <a
                      href={`/games/${gameId}/play`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={SquareArrowUpRightIcon} />
                </Button>
              </>
            ) : null}
            <Button
              aria-label="Close panel"
              onClick={onClose}
              size="icon-sm"
              variant="ghost"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {previewMounted && previewToken ? (
            <ChatPreviewBody
              id="side-panel-panel-preview"
              role="tabpanel"
              aria-labelledby="side-panel-tab-preview"
              hidden={activeTab !== "preview"}
              disablePointerEvents={dragging}
              gameId={gameId}
              previewToken={previewToken}
              revision={revision}
              reloadKey={reloadKey}
            />
          ) : null}
          {activeTab === "agents" && hasRuns ? (
            <div
              id="side-panel-panel-agents"
              role="tabpanel"
              aria-labelledby="side-panel-tab-agents"
              className="@container flex h-full min-h-0 flex-col"
            >
              <AgentsTabBody
                records={subagentRuns}
                selectedRunId={selectedRunId}
                onSelectRun={onSelectRun}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * The mobile shape of the panel: a bottom `Drawer` — same `swipeDirection="down"`
 * plus `showSwipeHandle` shell `subagent-panel.tsx`'s `SubagentPanel` uses on
 * this viewport — rather than a sliding pane that mounts the game.
 *
 * This deliberately never mounts `ChatPreviewBody`. The old pane
 * (`w-3/5`, sliding in from the right) put the running game directly behind
 * a swipeable surface, so the drawer's own swipe-to-dismiss gesture and the
 * game's touch input were reading the same drags — a player trying to steer
 * could close the panel by accident. The engine is also built around
 * keyboard and pointer-lock input in the first place, not a panel meant to
 * be swiped away. So this shows only a title, a one-line explanation of
 * what "Play" does, and a single button that navigates to `/games/[id]/play`
 * in the same tab — a new tab is an awkward add-on on a phone, and the chat
 * underneath reconnects fine when the player comes back to it.
 */
function MobilePreviewDrawer({
  open,
  gameId,
  previewToken,
  onOpenChange,
}: {
  open: boolean
  gameId: string
  previewToken?: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection="down"
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader className="pb-4">
          <DrawerTitle>Preview</DrawerTitle>
          <DrawerDescription>
            {previewToken
              ? "Play your game full-screen. The chat stays right where you left it."
              : "Nothing to play yet — send a message in the chat to build the game first."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-6">
          {previewToken ? (
            <Button
              className="w-full"
              render={<Link href={`/games/${gameId}/play`} />}
            >
              Play
            </Button>
          ) : (
            <Button className="w-full" disabled>
              Play
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
