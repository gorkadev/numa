"use client"

import { useState } from "react"

import type { UIMessage } from "ai"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@workspace/ui/components/resizable"

import { ChatPreview } from "@/components/chat-preview"
import { ChatThread } from "@/components/chat-thread"

/**
 * The client boundary for a game: the page stays a server component that only
 * loads the thread, while the split between the conversation and the preview —
 * which is resized in the browser — lives from here down.
 */
export function GameChat({
  gameId,
  hasSandbox,
  initialMessages,
  initialSessions,
  initialPrompt,
}: {
  gameId: string
  /**
   * Whether the game's sandbox has been provisioned. Until the chat's first
   * turn creates it there is nothing to preview, and the proxy would only 404 —
   * so the pane is left out entirely rather than shown broken.
   */
  hasSandbox: boolean
  initialMessages: UIMessage[]
  initialSessions?: Record<
    string,
    { publicAccessToken: string; lastEventId?: string }
  >
  initialPrompt?: string
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

  const thread = (
    <ChatThread
      gameId={gameId}
      initialMessages={initialMessages}
      initialSessions={initialSessions}
      initialPrompt={initialPrompt}
      onRevision={setRevision}
    />
  )

  /**
   * Without a preview there is no split to resize, so the panel group is
   * dropped along with it — a single panel that cannot move is just a wrapper
   * that costs a layout.
   */
  if (!hasSandbox) return <div className="h-svh">{thread}</div>

  return (
    <ResizablePanelGroup className="h-svh">
      <ResizablePanel id="chat" defaultSize="40" minSize="25">
        {thread}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="preview" defaultSize="60" minSize="30">
        <ChatPreview gameId={gameId} revision={revision} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
