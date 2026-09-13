"use client"

import {
  Alert01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BotIcon,
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
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { subagentStatusLabel } from "@/components/chat/subagent-entry"
import { SubagentRunDetail } from "@/components/chat/subagent-run-detail"
import type { SubagentRunRecord } from "@/lib/games/harness/records"

export type SubagentPanelProps = {
  /** Every sub-agent run recorded on this thread so far, in dispatch order. */
  records: SubagentRunRecord[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * `null` shows the run list; an `agentId` shows that run's detail.
   * Controlled, alongside `open`, so 10b can lift both in
   * `chat-thread.tsx`/`game-chat.tsx`: the thread-header button and an
   * inline `SubagentEntry` both drive this same panel (design.md
   * decision 16).
   */
  selectedRunId: string | null
  onSelectRun: (agentId: string | null) => void
}

/**
 * One run's row in the list, before it has been opened.
 *
 * `ItemMedia` carries the bot identity (`BotIcon`), not a status tick: the
 * status itself is already spelled out in `ItemActions`, so the icon only
 * needs to interrupt for the two states that change what the row IS —
 * still running, or failed — rather than restate every terminal status a
 * second time.
 *
 * Exported for `side-panel.tsx`'s wide Agents master-detail layout (10c),
 * which needs the same row rendered as a left-column list item next to a
 * persistent detail pane rather than as a step in a list-then-detail
 * sequence. `selected` only matters to that caller — the narrow drawer/list
 * body below navigates away from the list the moment a run opens, so it has
 * nothing to mark current.
 */
export function SubagentRunRow({
  record,
  selected = false,
  onSelect,
}: {
  record: SubagentRunRecord
  selected?: boolean
  onSelect: (agentId: string) => void
}) {
  const running = record.status === "running"
  const failed = record.status === "error"

  return (
    <Item
      size="sm"
      /**
       * `muted` gives each row its own surface: the default variant is
       * transparent, so on the panel's `bg-popover` the rows had no edge at
       * all. Hover steps up to the full `bg-muted` from there. A selected row
       * steps up again, to `bg-background`, so it reads as raised above its
       * unselected siblings rather than blending into the hover state.
       */
      variant="muted"
      render={<button type="button" />}
      className={cn(
        "cursor-pointer text-left hover:bg-muted",
        selected && "bg-muted"
      )}
      aria-current={selected ? "true" : undefined}
      data-selected={selected || undefined}
      onClick={() => onSelect(record.agentId)}
    >
      <ItemMedia variant="icon">
        {running ? (
          <Spinner />
        ) : (
          <HugeiconsIcon
            icon={failed ? Alert01Icon : BotIcon}
            strokeWidth={2}
            className={failed ? "text-destructive" : "text-muted-foreground"}
          />
        )}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{record.displayName}</ItemTitle>
        <ItemDescription className="line-clamp-1">
          {record.role}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span
          className={cn("text-xs text-muted-foreground", running && "shimmer")}
        >
          {running ? record.activity : subagentStatusLabel(record.status)}
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </ItemActions>
    </Item>
  )
}

/**
 * The scroll region and list/detail body shared by both the desktop docked
 * pane and the mobile `Drawer` below — everything except the header (each
 * shell wires its own title/description into its own markup, so those stay
 * in `SubagentPanel` itself) and the outer shell, whose choice is
 * `useIsMobile`'s alone.
 *
 * Padding is the one thing that differs between shells — the drawer's
 * `DrawerHeader` and the pane's card header end at different edges — so it is
 * taken as a `className` rather than duplicating this whole body for a single
 * class difference.
 *
 * `min-h-0` alongside `flex-1` is what makes this actually scroll: a flex
 * item's default `min-height: auto` grows to fit its content, so without it
 * the run list (or a long run's tool-call history) simply pushed the whole
 * panel taller instead of scrolling inside it.
 *
 * A native scroller, not `ScrollArea`: its viewport sizes itself with
 * `height: 100%`, which only resolves against a parent of definite height.
 * The docked pane's card has one; the drawer does not — its popup is
 * `height: auto` capped by a `max-height` — so inside the drawer the viewport
 * grew to its full content height and the drawer's own `overflow: hidden`
 * clipped it, leaving nothing to scroll. `scroll-fade` also needs the
 * scroller itself to carry the overflow, which `ScrollArea`'s inner viewport
 * would have hidden from it.
 *
 * Exported for `side-panel.tsx` (10c): it is exactly the narrow-container
 * fallback the Agents tab needs there too — list, then detail with an "All
 * runs" back button — so the two stay pixel-for-pixel identical rather than
 * drifting apart the way `SubagentRunRow` above used to before it was shared.
 */
export function SubagentPanelBody({
  records,
  selected,
  onSelectRun,
  className,
}: {
  records: SubagentRunRecord[]
  selected: SubagentRunRecord | null
  onSelectRun: (agentId: string | null) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "no-scrollbar min-h-0 flex-1 scroll-fade overflow-y-auto overscroll-contain",
        className
      )}
    >
      {selected ? (
        <div className="flex flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ms-2 w-fit"
            onClick={() => onSelectRun(null)}
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            All runs
          </Button>
          <SubagentRunDetail record={selected} />
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sub-agent runs yet.</p>
      ) : (
        <ItemGroup>
          {records.map((record) => (
            <SubagentRunRow
              key={record.agentId}
              record={record}
              onSelect={onSelectRun}
            />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}

/** The title every shell renders; the mobile drawer also shows the longer description below it. */
const PANEL_TITLE = "Sub-agent runs"
const PANEL_DESCRIPTION = "Every sub-agent this thread has dispatched."

/**
 * The mobile half of `subagent-view`'s panel: opened from the thread header
 * to list every recorded run (`displayName` primary, role secondary —
 * `subagent-view`'s Sub-Agents Are Presented as Named Bots requirement), or
 * opened straight onto one run's detail from its inline entry.
 *
 * Desktop no longer has a docked pane of its own here — 10c folded it into
 * `side-panel.tsx`'s Agents tab, which shares the right side of the screen
 * with the preview instead of taking a second exclusive pane next to it (the
 * two used to be mutually exclusive panes that both slid in from the same
 * edge, which is what let a reader see both animating and overlapping while
 * switching between them; the fix was one shell with two tabs, not two
 * shells). This component now renders only on a narrow viewport, as a bottom
 * `Drawer` — a side pane would cover most of a narrow screen anyway, and a
 * bottom sheet is the platform-native shape there (same reasoning as
 * `sidebar.tsx`'s own mobile branch). `game-chat.tsx` still owns `open`: it
 * is true only while the panel is open AND the active tab is "agents", so on
 * desktop — where that tab lives inside `SidePanel` instead — this drawer
 * simply never has anything to show.
 *
 * `SubagentPanelBody` (and `SubagentRunRow` within it) is exported so
 * `side-panel.tsx` can render the identical list/detail body inside its own
 * Agents tab rather than a second implementation drifting apart from this
 * one over time.
 *
 * Purely props-driven, same as `SubagentRunDetail`: a caller re-rendering
 * with a newer `records` array is what makes a selected run's detail "keep
 * updating while it runs".
 */
export function SubagentPanel({
  records,
  open,
  onOpenChange,
  selectedRunId,
  onSelectRun,
}: SubagentPanelProps) {
  const isMobile = useIsMobile()
  const selected =
    records.find((record) => record.agentId === selectedRunId) ?? null

  if (!isMobile) return null

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection="down"
      showSwipeHandle
    >
      <DrawerContent>
        {/**
         * `pb-4` puts back the gap `drawer.tsx`'s own `pb-0` takes away — it
         * assumes a footer or padded body follows, while this body starts
         * flush at its top edge. `SidePanel`'s card header carries its own
         * gap from the same `px-3`/height rhythm, which is why only the
         * drawer needs it restated here.
         */}
        <DrawerHeader className="pb-4">
          <DrawerTitle>{PANEL_TITLE}</DrawerTitle>
          <DrawerDescription>{PANEL_DESCRIPTION}</DrawerDescription>
        </DrawerHeader>
        <SubagentPanelBody
          records={records}
          selected={selected}
          onSelectRun={onSelectRun}
          className="px-6 pb-6"
        />
      </DrawerContent>
    </Drawer>
  )
}
