"use client"

import { useRef, useState } from "react"

import type { UIMessage } from "ai"
import { BotIcon, PanelRightIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"

import { ChatThread } from "@/components/chat/chat-thread"
import { SidePanel, type SidePanelTab } from "@/components/chat/side-panel"
import { SubagentPanel } from "@/components/chat/subagent-panel"
import { GameMenu } from "@/components/game-menu"
import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import type { TierId } from "@/lib/ai/model-catalog"
import type { SubagentRunRecord } from "@/lib/games/harness/records"

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
  initialTierId,
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
  /** The tier the home screen's picker was on, when the game came from there. */
  initialTierId?: TierId
}) {
  /**
   * The preview's revision, owned here because the panel and the thread are
   * siblings: the thread is the only side that sees the agent's stream, and
   * the preview is the only side that can act on it.
   *
   * It starts at zero — the frame that mounts with the page is already showing
   * whatever the last turn left behind, so the first bump is the first change
   * this session made.
   */
  const [revision, setRevision] = useState(0)

  /**
   * The right-hand `SidePanel` used to be two mutually exclusive docked
   * panes — a preview pane and a `SubagentPanel` pane — each sliding in from
   * the same edge. Closing one to open the other meant both were mid-slide
   * for 300ms, which is exactly the visible overlap this design replaced:
   * one shell (`panelOpen`) with two tabs (`activeTab`) inside it, so the
   * shell's own open/close slide is the only thing that ever animates and
   * switching tabs only swaps what's inside.
   */
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SidePanelTab>("preview")

  /**
   * Whether the preview has ever been opened, which is what decides if the
   * frame exists at all.
   *
   * Two states rather than one because the frame is expensive in both
   * directions. Mounting it on page load starts a WebGL game nobody asked to
   * see; unmounting it on every close means reopening restarts the game from
   * its first frame, losing whatever the player was in the middle of. So
   * nothing loads until the first open, and after that the frame stays
   * mounted — hidden rather than unmounted while another tab is active, or
   * clipped to nothing while the whole panel is closed — and toggling then
   * costs nothing and preserves the run.
   */
  const [previewMounted, setPreviewMounted] = useState(false)

  /**
   * The sub-agent panel's state, lifted here so this header's button and any
   * inline `SubagentEntry` inside `ChatThread` drive the exact same records
   * (design.md decision 16). `ChatThread` reports the records themselves —
   * they come from its own `messages` — the same up-reporting shape
   * `onRevision` already uses for the preview's revision.
   */
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [subagentRuns, setSubagentRuns] = useState<SubagentRunRecord[]>([])
  const hasSubagentRuns = subagentRuns.length > 0

  /**
   * The flex row `SidePanel`'s resize handle measures against, so a drag can
   * turn a pointer delta into a percentage of the actual layout width rather
   * than assuming it owns the whole viewport.
   */
  const layoutRef = useRef<HTMLDivElement>(null)

  function openPanel(tab: SidePanelTab) {
    if (tab === "preview") setPreviewMounted(true)
    setActiveTab(tab)
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
  }

  /**
   * `SidePanel`'s own tab bar switches tabs without going through
   * `openPanel` above — the panel is already open, so there is nothing to
   * open — but landing on Preview is still the first time its tab has been
   * selected if the panel was opened straight onto Agents from the header.
   * Without this, clicking the Preview tab in that situation would flip
   * `activeTab` with `previewMounted` still `false`, and the tab would show
   * nothing.
   */
  function onSidePanelTabChange(tab: SidePanelTab) {
    if (tab === "preview") setPreviewMounted(true)
    setActiveTab(tab)
  }

  /**
   * The single entry point `ChatThread`'s inline `SubagentEntry` drives via
   * `onSubagentPanelOpenChange` — kept as its own function, rather than
   * inlined at the call site, so `ChatThread`'s prop shape (`(open: boolean)
   * => void`) does not have to change just because the panel underneath it
   * grew a second tab.
   */
  function onSubagentPanelOpenChange(open: boolean) {
    if (open) {
      openPanel("agents")
    } else {
      closePanel()
    }
  }

  /**
   * A tab can go from available to unavailable out from under an open panel
   * — the one real case today is the run list emptying, though nothing
   * currently does that mid-session. Rather than store a "corrected"
   * `activeTab` through an effect (which would fire a second render just to
   * fix up the first one), the tab actually shown is derived straight from
   * `activeTab` and availability on every render: this falls back to
   * whichever tab still has content, or reports the panel as closed if
   * neither does. `activeTab` itself is left untouched, so if the
   * unavailable tab's content comes back later — the run list refills — the
   * panel picks the reader's original choice back up instead of staying on
   * whatever it fell back to.
   */
  const previewAvailable = Boolean(previewToken)
  const agentsAvailable = hasSubagentRuns
  const effectiveTab: SidePanelTab | null =
    activeTab === "preview" && previewAvailable
      ? "preview"
      : activeTab === "agents" && agentsAvailable
        ? "agents"
        : previewAvailable
          ? "preview"
          : agentsAvailable
            ? "agents"
            : null
  const effectivePanelOpen = panelOpen && effectiveTab !== null

  const previewPressed = effectivePanelOpen && effectiveTab === "preview"
  const agentsPressed = effectivePanelOpen && effectiveTab === "agents"

  return (
    <div ref={layoutRef} className="flex h-svh overflow-hidden">
      {/**
       * `min-w-0` is what lets this pane actually shrink. A flex item's default
       * `min-width: auto` is the width of its content, so without it a long
       * unbroken line in the thread would set a floor the panel could never
       * push past — the split would simply refuse to move.
       */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b px-4">
          <MobileSidebarTrigger className="-ms-1.5" />
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
               * will do next; the panel's own close button only ever closes
               * and needs no such state.
               */
              className="aria-pressed:bg-muted aria-pressed:text-foreground"
              onClick={() =>
                previewPressed ? closePanel() : openPanel("preview")
              }
              aria-pressed={previewPressed}
            >
              <HugeiconsIcon icon={PanelRightIcon} strokeWidth={2} />
              <span className="sr-only">
                {previewPressed ? "Hide preview" : "Show preview"}
              </span>
            </Button>
          ) : null}
          {hasSubagentRuns ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="aria-pressed:bg-muted aria-pressed:text-foreground"
              /**
               * Always opens on the run list, not wherever the panel was
               * left: a reader pressing the header button wants an overview
               * (`subagent-view`'s "Player opens the panel from the header"
               * scenario), while an inline `SubagentEntry` is the one path
               * that opens straight onto a single run's detail.
               */
              onClick={() => {
                if (agentsPressed) {
                  onSubagentPanelOpenChange(false)
                  return
                }
                setSelectedRunId(null)
                onSubagentPanelOpenChange(true)
              }}
              aria-pressed={agentsPressed}
            >
              <HugeiconsIcon icon={BotIcon} strokeWidth={2} />
              <span className="sr-only">Sub-agent runs</span>
            </Button>
          ) : null}
          <GameMenu gameId={gameId} title={title} />
        </header>
        <ChatThread
          gameId={gameId}
          initialMessages={initialMessages}
          initialSessions={initialSessions}
          initialPrompt={initialPrompt}
          initialTierId={initialTierId}
          onRevision={setRevision}
          onSelectedRunIdChange={setSelectedRunId}
          onSubagentPanelOpenChange={onSubagentPanelOpenChange}
          onSubagentRunsChange={setSubagentRuns}
        />
      </div>

      <SidePanel
        gameId={gameId}
        previewToken={previewToken}
        previewMounted={previewMounted}
        revision={revision}
        subagentRuns={subagentRuns}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
        open={effectivePanelOpen}
        activeTab={effectiveTab ?? activeTab}
        onActiveTabChange={onSidePanelTabChange}
        onClose={closePanel}
        layoutRef={layoutRef}
      />

      {/**
       * Mobile only (`SubagentPanel` renders nothing on desktop, where the
       * Agents tab above lives inside `SidePanel` instead): the bottom
       * `Drawer` for sub-agent runs, open exactly while the panel is open
       * on the Agents tab. Dismissing the drawer — the sheet's own swipe or
       * scrim — closes the whole panel through the same `onSubagentPanelOpenChange`
       * every other path uses, rather than leaving `panelOpen` true with
       * nothing left to show for it.
       */}
      <SubagentPanel
        records={subagentRuns}
        open={agentsPressed}
        onOpenChange={onSubagentPanelOpenChange}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
      />
    </div>
  )
}
