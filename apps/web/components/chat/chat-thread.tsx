"use client"

import type { AttachmentPart } from "@/lib/games/attachments"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { UIMessage } from "ai"
import { useTranslations } from "next-intl"
import { Alert01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Message, MessageContent } from "@workspace/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller"

import { ChatComposer } from "@/components/chat-composer"
import { AssistantAvatar } from "@/components/chat/assistant-avatar"
import { ChatMessage } from "@/components/chat/chat-message"
import { TaskStrip } from "@/components/chat/task-strip"
import { ThreadOutline } from "@/components/chat/thread-outline"
import { Thinking } from "@/components/chat/thinking"
import { useGameChat } from "@/components/chat/use-game-chat"
import type { TierId } from "@/lib/ai/model-catalog"
import type { TemplateId } from "@/lib/games/templates/catalog"
import {
  latestContextUsage,
  sumSessionActivity,
  sumSessionSpeed,
  sumSessionTiming,
  sumSessionUsage,
} from "@/lib/ai/session-usage"
import { UsageFooter } from "@/components/chat/usage-footer"
import { thinkingLabelKey } from "@/lib/games/build-progress"
import type { SubagentRunRecord } from "@/lib/games/harness/records"
import { deriveTaskStrip, shouldShowTaskStrip } from "@/lib/games/plan-tasks"
import { loadFileTree } from "@/lib/games/file-tree-cache"
import { mentionFiles } from "@/lib/games/mentions"
import { collectThreadSubagentRuns } from "@/lib/games/tool-parts"

export function ChatThread({
  gameId,
  templateId,
  initialMessages,
  initialSessions,
  initialPrompt,
  initialFiles,
  initialTierId,
  contextWindows,
  showSessionStats,
  onRevision,
  onSelectedRunIdChange,
  onSubagentPanelOpenChange,
  onSubagentRunsChange,
  onOpenFile,
  filesVersion,
}: {
  gameId: string
  templateId: TemplateId
  initialMessages: UIMessage[]
  /**
   * The chat session persisted with the thread — the transport's token and its
   * position in the response stream. Handing it over on the first render is
   * what lets a reopened tab reconnect to the existing conversation instead of
   * paying a round trip to create a second one.
   */
  initialSessions?: Record<
    string,
    { publicAccessToken: string; lastEventId?: string }
  >
  /**
   * The prompt a freshly created game was named from, handed over in the query
   * string. It is a message that has not been sent yet, not history.
   */
  initialPrompt?: string
  /** The files attached to `initialPrompt`. */
  initialFiles?: AttachmentPart[]
  /**
   * The tier the home screen's picker was on, handed over in the query string
   * beside the prompt it created the game with. It seeds the picker here so the
   * first turn is sent with what the player actually chose; from then on this
   * thread's own picker owns the value, which is why it is only the initial
   * one and not a controlled prop.
   */
  initialTierId?: TierId
  /** Each tier's orchestrator window, so the context ring can start at zero. */
  contextWindows: Record<TierId, number>
  /** From Settings › Game: whether the footer shows the session statistics button. */
  showSessionStats: boolean
  /**
   * Reports the revision the agent stamps on a turn that changed the game's
   * files. The thread owns the stream, but the preview is its sibling, so the
   * signal is handed up rather than acted on here.
   */
  onRevision?: (revision: number) => void
  /**
   * The sub-agent panel's state is lifted to `game-chat.tsx`, which renders
   * the actual `SubagentPanel` (design.md decision 16;
   * `subagent-view`'s Sub-Agent Runs Are Openable From the Thread
   * requirement) — `game-chat.tsx` also owns the mutual exclusion with the
   * preview pane, which this thread has no reason to know about. This
   * component only needs to select a run and ask for the panel to open,
   * both of which an inline `SubagentEntry` triggers.
   */
  onSelectedRunIdChange: (agentId: string | null) => void
  onSubagentPanelOpenChange: (open: boolean) => void
  /** Reported upward so the header button can hide itself on a thread with no runs yet — the same up-reporting shape `onRevision` above already uses. */
  onSubagentRunsChange: (runs: SubagentRunRecord[]) => void
  /** Opens a file mentioned in a sent message in the side panel's Files tab. */
  onOpenFile?: (path: string) => void
  /** Which listing of the game's files is current; the `@` picker reuses the one the Files tab fetched for it. */
  filesVersion: number
}) {
  const t = useTranslations("ChatActivity")

  /** The same listing the Files tab reads, flattened for the composer's `@` picker. */
  const loadMentionFiles = useCallback(
    async (signal: AbortSignal) => {
      const tree = await loadFileTree(gameId, filesVersion)
      signal.throwIfAborted()
      return mentionFiles(tree)
    },
    [gameId, filesVersion]
  )
  const {
    messages,
    error,
    buildProgress,
    failureKind,
    liveContext,
    stop,
    onAnswer,
    send,
    tierId,
    setTierId,
    pending,
    reconnecting,
    input,
    setInput,
  } = useGameChat({
    gameId,
    initialMessages,
    initialSessions,
    initialPrompt,
    initialFiles,
    initialTierId,
    onRevision,
  })

  const runs = useMemo(() => groupRuns(messages), [messages])
  const trailing = runs.at(-1)

  /**
   * The user messages the thread mounted with, which must never act as scroll
   * anchors. The scroller jumps to the first anchor it has not handled yet
   * whenever its children change without their count changing, and it only
   * marks an anchor handled when that anchor arrives as a new item. History
   * rendered on mount never arrives that way, so a turn still streaming when
   * the player comes back to the thread walked the viewport up through every
   * earlier message, one stream update at a time.
   */
  const [historyIds] = useState(
    () => new Set(initialMessages.map((message) => message.id))
  )

  const subagentRuns = useMemo(
    () => collectThreadSubagentRuns(messages),
    [messages]
  )

  useEffect(() => {
    onSubagentRunsChange(subagentRuns)
  }, [subagentRuns, onSubagentRunsChange])

  /**
   * The task-list strip above the composer (`task-strip.tsx`): derived from
   * the latest build's `run_tasks` task bodies, or an older thread's `plan`
   * call (`lib/games/plan-tasks.ts`), shown while any task is not yet done or the
   * turn is still streaming — see `shouldShowTaskStrip`'s own comment for the
   * exact rule, including why a failed task keeps it visible after the turn
   * ends.
   */
  const taskStripTasks = useMemo(() => deriveTaskStrip(messages), [messages])
  const sessionUsage = useMemo(() => sumSessionUsage(messages), [messages])
  const sessionSpeed = useMemo(() => sumSessionSpeed(messages), [messages])
  const sessionTiming = useMemo(() => sumSessionTiming(messages), [messages])
  const sessionActivity = useMemo(() => sumSessionActivity(messages), [messages])
  /**
   * The stream's live reading wins while a turn runs; the newest reply's
   * stamped reading covers a thread opened fresh after a reload. Before any
   * turn the ring starts empty against the selected tier's window, so it is
   * on screen from the first frame instead of appearing when the first step
   * reports.
   */
  const contextUsage = useMemo(
    () =>
      liveContext ??
      latestContextUsage(messages) ?? {
        tokens: 0,
        window: contextWindows[tierId],
      },
    [liveContext, messages, contextWindows, tierId]
  )
  const showTaskStrip = shouldShowTaskStrip(taskStripTasks, pending)
  const thinkingKey = thinkingLabelKey(buildProgress, reconnecting)

  const onSelectRun = useCallback(
    (agentId: string) => {
      onSelectedRunIdChange(agentId)
      onSubagentPanelOpenChange(true)
    },
    [onSelectedRunIdChange, onSubagentPanelOpenChange]
  )

  /**
   * A trailing user message with no assistant run after it yet is the one
   * case `ChatMessage` cannot cover on its own — there is no assistant row
   * for it to attach a `<Thinking />` to, because none exists. Everywhere
   * else the indicator lives inside the trailing run's own row; see
   * `showThinking` in `chat/chat-message.tsx`.
   */
  const showLeadingThinking =
    (pending || reconnecting) && (!trailing || trailing.role === "user")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/**
       * `autoScroll` follows a streaming reply only while the reader is at the
       * live edge, and lets go the moment they scroll away — which is the
       * behaviour a thread that writes for minutes needs. Off by default in
       * the primitive, so a turn's output would otherwise grow below the fold
       * with no indication it had moved.
       */}
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport className="scroll-fade-y! [--scroll-fade-mask:initial]!">
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8 gap-4">
              {runs.map((run, index) => (
                <MessageScrollerItem
                  key={run.id}
                  messageId={run.id}
                  /**
                   * A turn starts where the player asked for something, so
                   * their message is what the viewport anchors on — the reply
                   * then streams below it rather than shoving it off screen.
                   * Only for messages sent from this mount; see `historyIds`.
                   */
                  scrollAnchor={run.role === "user" && !historyIds.has(run.id)}
                >
                  <ChatMessage
                    role={run.role}
                    messages={run.messages}
                    streaming={pending && index === runs.length - 1}
                    reconnecting={reconnecting && index === runs.length - 1}
                    thinkingKey={
                      index === runs.length - 1 ? thinkingKey : "thinking"
                    }
                    onAnswer={onAnswer}
                    onSelectRun={onSelectRun}
                    onOpenFile={onOpenFile}
                  />
                </MessageScrollerItem>
              ))}
              {showLeadingThinking ? (
                <MessageScrollerItem>
                  <Message align="start">
                    <AssistantAvatar />
                    <MessageContent>
                      <Thinking labelKey={thinkingKey} />
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton label={t("scrollToEnd")} />
          {runs.filter((run) => run.role === "user").length > 1 ? (
            <ThreadOutline runs={runs} />
          ) : null}
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-4">
        {/**
         * Only application-owned structured stream events get specific copy.
         * Provider and transport messages are not stable localization codes
         * and may contain diagnostics, so unknown failures use a localized
         * fallback rather than comparing or displaying English prose.
         */}
        {error ? (
          <Alert variant="destructive">
            <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
            <AlertTitle>{t("turnErrorTitle")}</AlertTitle>
            <AlertDescription>
              {failureKind === "credits-unprovisioned"
                ? t("creditsUnprovisioned")
                : failureKind === "credits-exhausted"
                  ? t("creditsExhausted")
                  : failureKind === "game-unavailable"
                    ? t("gameUnavailable")
                    : t("genericTurnError")}
            </AlertDescription>
          </Alert>
        ) : null}
        <ChatComposer
          value={input}
          onValueChange={setInput}
          onSubmit={send}
          attachable
          /**
           * `stopBuild` sends a `stop` chunk on the session's input channel
           * (`stopGeneration`), which aborts the agent's `streamText` call while
           * the run stays alive for the next message — so cancelling costs the
           * conversation nothing.
           */
          onStop={stop}
          tierId={tierId}
          onTierChange={setTierId}
          templateId={templateId}
          improverMode="change"
          loadMentionFiles={loadMentionFiles}
          onOpenFile={onOpenFile}
          autoFocus
          pending={pending}
          placeholder={t("placeholder")}
          usageSlot={
            <UsageFooter
              usage={sessionUsage}
              speed={sessionSpeed}
              activity={sessionActivity}
              timing={sessionTiming}
              context={contextUsage}
              showSessionStats={showSessionStats}
            />
          }
          tasksSlot={
            showTaskStrip && taskStripTasks ? (
              <TaskStrip tasks={taskStripTasks} />
            ) : undefined
          }
        />
      </div>
    </div>
  )
}

type Run = { id: string; role: "user" | "assistant"; messages: UIMessage[] }

/**
 * Consecutive messages, folded into the rows the thread actually renders.
 *
 * One assistant turn is one row — one avatar, one action row at the end —
 * even when it is stored as more than one `UIMessage`. It normally is not,
 * but answering an `ask_player` question on a resumed stream produces exactly
 * that: see the comment on `withoutContinuationOf` in `lib/ai/resume-stream.ts`
 * and the one above `chatTransport` in `chat/use-game-chat.ts`. Without this,
 * that one turn reads as two assistant replies — two avatars, two action rows
 * — until the next reload merges them back in storage.
 *
 * A user message never merges into anything. The player sends one message per
 * turn, and two of theirs in a row are two separate turns, not a continuation
 * of one.
 */
function groupRuns(messages: UIMessage[]): Run[] {
  const runs: Run[] = []

  for (const message of messages) {
    const open = runs.at(-1)

    if (message.role === "assistant" && open?.role === "assistant") {
      open.messages.push(message)
      continue
    }

    runs.push({
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      messages: [message],
    })
  }

  return runs
}
