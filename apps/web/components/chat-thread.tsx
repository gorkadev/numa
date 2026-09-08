"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
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

import { ChatComposer } from "@/components/chat-composer"

export function ChatThread({
  gameId,
  initialMessages,
  initialPrompt,
}: {
  gameId: string
  initialMessages: UIMessage[]
  /**
   * The prompt a freshly created game was named from, handed over in the query
   * string. It is a message that has not been sent yet, not history.
   */
  initialPrompt?: string
}) {
  const [input, setInput] = useState("")

  /**
   * One game owns one chat, so the game id doubles as the chat id — the
   * transport puts it in the request body, which is how the route handler knows
   * which thread to load and rewrite.
   *
   * The server holds the thread, so only the new message is posted; sending the
   * history back would be payload the handler discards anyway.
   */
  const { messages, sendMessage, status, error } = useChat({
    id: gameId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages, id }) {
        return { body: { id, message: messages[messages.length - 1] } }
      },
    }),
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
                      <Bubble
                        align={message.role === "user" ? "end" : "start"}
                        variant={
                          message.role === "user" ? "default" : "secondary"
                        }
                      >
                        {/**
                         * A UI message is a list of parts — text, tool calls,
                         * reasoning — so text is filtered out rather than read
                         * from a single `content` field.
                         */}
                        <BubbleContent>
                          {message.parts
                            .filter((part) => part.type === "text")
                            .map((part) => part.text)
                            .join("")}
                        </BubbleContent>
                      </Bubble>
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
          pending={pending}
          error={error ? "Something went wrong. Try again." : null}
          placeholder="Ask for a change…"
        />
      </div>
    </div>
  )
}
