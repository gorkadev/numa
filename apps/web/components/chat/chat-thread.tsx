"use client"

import { useMemo } from "react"

import type { UIMessage } from "ai"
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
import { Thinking } from "@/components/chat/thinking"
import { useGameChat } from "@/components/chat/use-game-chat"
import type { GameModelId } from "@/lib/ai/model-catalog"

export function ChatThread({
  gameId,
  initialMessages,
  initialSessions,
  initialPrompt,
  initialModelId,
  onRevision,
}: {
  gameId: string
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
  /**
   * The model the home screen's picker was on, handed over in the query string
   * beside the prompt it created the game with. It seeds the picker here so the
   * first turn is sent with what the player actually chose; from then on this
   * thread's own picker owns the value, which is why it is only the initial
   * one and not a controlled prop.
   */
  initialModelId?: GameModelId
  /**
   * Reports the revision the agent stamps on a turn that changed the game's
   * files. The thread owns the stream, but the preview is its sibling, so the
   * signal is handed up rather than acted on here.
   */
  onRevision?: (revision: number) => void
}) {
  const {
    messages,
    error,
    stop,
    onAnswer,
    send,
    modelId,
    setModelId,
    pending,
    input,
    setInput,
  } = useGameChat({
    gameId,
    initialMessages,
    initialSessions,
    initialPrompt,
    initialModelId,
    onRevision,
  })

  const runs = useMemo(() => groupRuns(messages), [messages])
  const trailing = runs.at(-1)

  /**
   * A trailing user message with no assistant run after it yet is the one
   * case `ChatMessage` cannot cover on its own — there is no assistant row
   * for it to attach a `<Thinking />` to, because none exists. Everywhere
   * else the indicator lives inside the trailing run's own row; see
   * `showThinking` in `chat/chat-message.tsx`.
   */
  const showLeadingThinking = pending && (!trailing || trailing.role === "user")

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
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
              {runs.map((run, index) => (
                <MessageScrollerItem
                  key={run.id}
                  messageId={run.id}
                  /**
                   * A turn starts where the player asked for something, so
                   * their message is what the viewport anchors on — the reply
                   * then streams below it rather than shoving it off screen.
                   */
                  scrollAnchor={run.role === "user"}
                >
                  <ChatMessage
                    role={run.role}
                    messages={run.messages}
                    streaming={pending && index === runs.length - 1}
                    onAnswer={onAnswer}
                  />
                </MessageScrollerItem>
              ))}
              {showLeadingThinking ? (
                <MessageScrollerItem>
                  <Message align="start">
                    <AssistantAvatar />
                    <MessageContent>
                      <Thinking />
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-4 pb-4">
        {/**
         * The failure gets its own surface with the real message in it, rather
         * than one generic line under the composer. A turn can die for reasons
         * the player can act on and that look nothing alike — no credits left,
         * the sandbox failed to start, the model refused — and collapsing all
         * of them into "something went wrong" turns a fixable problem into a
         * dead end.
         */}
        {error ? (
          <Alert variant="destructive">
            <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
            <AlertTitle>That turn did not go through</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <ChatComposer
          value={input}
          onValueChange={setInput}
          onSubmit={send}
          /**
           * The transport turns this abort into a `stop` chunk on the session's
           * input channel, which aborts the agent's `streamText` call while the
           * run stays alive for the next message — so cancelling costs the
           * conversation nothing.
           */
          onStop={stop}
          modelId={modelId}
          onModelChange={setModelId}
          pending={pending}
          placeholder="Ask for a change…"
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
