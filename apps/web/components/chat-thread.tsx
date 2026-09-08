"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai"
import { Alert01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@workspace/ui/components/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@workspace/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller"

import { Spinner } from "@workspace/ui/components/spinner"

import { ChatComposer } from "@/components/chat-composer"
import {
  mintGameChatAccessToken,
  startGameChatSession,
} from "@/lib/games/chat-actions"
import { readGameRevision } from "@/lib/games/revision"
import type { gameChat } from "@/trigger/chat"

export function ChatThread({
  gameId,
  initialMessages,
  initialSessions,
  initialPrompt,
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
   * Reports the revision the agent stamps on a turn that changed the game's
   * files. The thread owns the stream, but the preview is its sibling, so the
   * signal is handed up rather than acted on here.
   */
  onRevision?: (revision: number) => void
}) {
  const [input, setInput] = useState("")

  /**
   * One game owns one chat, so the game id doubles as the chat id — it is the
   * chat the agent's Session is keyed on, which is how the task knows which
   * thread to load and rewrite.
   *
   * There is no API route to talk to: the transport speaks to the agent
   * directly, minting its token through server actions so the browser never
   * holds the Trigger.dev secret key.
   */
  const transport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintGameChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startGameChatSession({ chatId, clientData }),
    sessions: initialSessions,
  })

  const { messages, sendMessage, stop, status, error } = useChat({
    id: gameId,
    messages: initialMessages,
    transport,
    /**
     * Reconnects to a turn that is still streaming when the tab mounts. A
     * brand-new game has nothing to reconnect to, so it is gated on there
     * being history.
     */
    resume: initialMessages.length > 0,
    /**
     * Custom stream parts land here rather than in `messages`, because the
     * agent marks this one transient — it is a notification about the sandbox,
     * not a piece of the conversation.
     *
     * The callback is read from a ref on every chunk, so the closure is never
     * the stale one from the render that created the chat.
     */
    onData: (part) => {
      const revision = readGameRevision(part)

      if (revision !== null) onRevision?.(revision)
    },
  })

  const pending = status === "submitted" || status === "streaming"

  function handleSubmit(text: string) {
    sendMessage({ text })
    setInput("")
  }

  /**
   * Sends the prompt that created the game as the thread's first message, so
   * the home screen's composer and the one in here mean the same thing.
   *
   * The ref — not the effect's dependencies — is what makes this happen once:
   * React runs effects twice in development, and `sendMessage` would otherwise
   * post the prompt twice. Sending is skipped entirely when the thread already
   * holds messages, which is what a reload of an answered game looks like.
   *
   * The parameter is dropped with the History API rather than `router.replace`
   * so the URL stops advertising the prompt without a navigation that would
   * interrupt the stream this effect just started.
   */
  const sentInitialPrompt = useRef(false)

  useEffect(() => {
    if (sentInitialPrompt.current) return
    if (!initialPrompt) return

    sentInitialPrompt.current = true

    if (initialMessages.length === 0) {
      sendMessage({ text: initialPrompt })
    }

    window.history.replaceState(null, "", `/games/${gameId}`)
  }, [gameId, initialMessages.length, initialPrompt, sendMessage])

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
              {messages.map((message) => (
                <MessageScrollerItem key={message.id}>
                  <Message align={message.role === "user" ? "end" : "start"}>
                    {message.role === "assistant" ? (
                      <MessageAvatar className="bg-transparent p-1">
                        <Image
                          src="/logo.svg"
                          alt="Numa"
                          width={20}
                          height={24}
                        />
                      </MessageAvatar>
                    ) : null}
                    <MessageContent>
                      {/**
                       * Parts are rendered in the order the model produced
                       * them, rather than filtered down to text. A turn is a
                       * loop — edit a file, edit another, then explain — and
                       * collapsing it to its final sentence would hide the
                       * work while it is still happening, which is exactly the
                       * stretch the user most wants to see.
                       */}
                      {message.parts.map((part, index) => {
                        if (isToolUIPart(part)) {
                          return (
                            <ToolMarker key={part.toolCallId} part={part} />
                          )
                        }

                        if (part.type !== "text") return null

                        return (
                          <Bubble
                            key={`${message.id}-${index}`}
                            align={message.role === "user" ? "end" : "start"}
                            variant={
                              message.role === "user" ? "default" : "secondary"
                            }
                          >
                            <BubbleContent>{part.text}</BubbleContent>
                          </Bubble>
                        )
                      })}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <ChatComposer
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          /**
           * The transport turns this abort into a `stop` chunk on the session's
           * input channel, which aborts the agent's `streamText` call while the
           * run stays alive for the next message — so cancelling costs the
           * conversation nothing.
           */
          onStop={stop}
          pending={pending}
          error={error ? "Something went wrong. Try again." : null}
          placeholder="Ask for a change…"
        />
      </div>
    </div>
  )
}

/**
 * How each tool reads in the thread, as the pair of verbs a marker needs:
 * what it is doing now, and what it did.
 *
 * Keyed by tool name rather than derived from it, because "replace_text"
 * turned into a label mechanically reads like a function call. The user is
 * watching their game get built, not reading a log.
 */
const TOOL_LABELS: Record<string, { active: string; done: string }> = {
  read_file: { active: "Reading", done: "Read" },
  list_files: { active: "Looking at the game", done: "Looked at the game" },
  write_file: { active: "Writing", done: "Wrote" },
  replace_text: { active: "Editing", done: "Edited" },
  delete_file: { active: "Deleting", done: "Deleted" },
}

/**
 * The file a tool call is about, when it has one.
 *
 * The input is `unknown` by design: it arrives as a partial JSON object while
 * the model is still streaming its arguments, so a `path` that is not yet a
 * string is normal rather than exceptional, and the marker simply goes without
 * until it is.
 */
function toolPath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null

  const path = (input as { path?: unknown }).path

  return typeof path === "string" && path.length > 0 ? path : null
}

/**
 * Whether a completed tool call actually succeeded.
 *
 * The subtle part of this whole component. The game tools return their
 * failures as an `{ error }` result instead of throwing, so the model can read
 * the message and correct itself without the turn dying — which means a failed
 * call arrives as `output-available`, the same state as a successful one.
 * Checking only for `output-error` would render every one of those failures as
 * a tick, and quietly tell the user a file was written when it was not.
 */
function outputError(output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null

  const error = (output as { error?: unknown }).error

  return typeof error === "string" ? error : null
}

/**
 * One line of "here is what I am doing to your game".
 *
 * Collapses the SDK's seven tool-call states into the three the user cares
 * about: it is happening, it worked, it did not. The states beyond those —
 * approval requested, responded, denied — cannot occur here because no tool is
 * configured to require approval, but they resolve rather than crash if that
 * ever changes.
 */
function ToolMarker({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = getToolName(part)
  const labels = TOOL_LABELS[name] ?? { active: name, done: name }
  const path = toolPath(part.input)

  const error =
    part.state === "output-error"
      ? part.errorText
      : part.state === "output-available"
        ? outputError(part.output)
        : part.state === "output-denied"
          ? "Not allowed"
          : null

  const settled =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"

  const label = `${settled ? labels.done : labels.active}${path ? ` ${path}` : ""}`

  if (error) {
    return (
      /**
       * The message goes in `title` rather than on screen. It is written for
       * the model to recover from — "that text appears 3 times" — and the user
       * cannot act on it, so the line stays short and the detail stays one
       * hover away.
       */
      <Marker className="text-destructive" title={error}>
        <MarkerIcon>
          <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
        </MarkerIcon>
        <MarkerContent>{label} failed</MarkerContent>
      </Marker>
    )
  }

  return (
    <Marker aria-live={settled ? undefined : "polite"}>
      <MarkerIcon>
        {settled ? (
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
        ) : (
          <Spinner />
        )}
      </MarkerIcon>
      <MarkerContent>{label}</MarkerContent>
    </Marker>
  )
}
