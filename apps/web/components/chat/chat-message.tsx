"use client"

import { memo, useMemo } from "react"

import type { UIMessage } from "ai"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { Message, MessageContent } from "@workspace/ui/components/message"

import { AskPlayer, AskPlayerAnswer } from "@/components/chat/ask-player"
import { AssistantAvatar } from "@/components/chat/assistant-avatar"
import { Markdown } from "@/components/chat/markdown"
import { MessageActions } from "@/components/chat/message-actions"
import { Thinking } from "@/components/chat/thinking"
import { ToolGroup } from "@/components/chat/tool-group"
import { askPlayerAnswer } from "@/lib/games/ask-player"
import { groupParts, isSettled, type PartBlock } from "@/lib/games/tool-parts"
import type { AskPlayerOutput } from "@/lib/games/tools"

type ChatMessageProps = {
  /**
   * One row is one turn's worth of history: a lone user message, or a run of
   * one or more consecutive assistant messages folded together by
   * `groupRuns` in `chat-thread.tsx`. `role` is the run's role, not any one
   * message's — it decides which side of the thread the row sits on and
   * whether it gets an avatar.
   */
  role: "user" | "assistant"
  messages: UIMessage[]
  /**
   * True only for the trailing run while the agent has the turn. A boolean
   * rather than `pending` plus an index, so every other row's props stay
   * identical while a turn streams and its memo holds.
   */
  streaming: boolean
  onAnswer: (toolCallId: string, output: AskPlayerOutput) => void
}

function ChatMessageImpl({
  role,
  messages,
  streaming,
  onAnswer,
}: ChatMessageProps) {
  /**
   * Recomputed only when the messages making up this row actually change —
   * `messages` is a stable reference for every row except the one(s) a
   * streamed chunk just touched, courtesy of `ReactChatState.replaceMessage`
   * only ever replacing the one message it updates (see the memo comparator
   * below, and its comment, for where that fact is load-bearing).
   */
  const parts = useMemo(
    () => messages.flatMap((message) => message.parts),
    [messages]
  )
  const blocks = useMemo(() => groupParts(parts), [parts])

  const lastBlock = blocks.at(-1)
  const showThinking =
    role === "assistant" && streaming && !isProducing(lastBlock)

  /**
   * An assistant run with nothing to render and nothing in flight is skipped
   * rather than drawn as an avatar beside an empty column.
   *
   * While the turn is live the same empty run is the "request is away, no
   * token yet" moment, and it keeps its row: `showThinking` is true for it,
   * because no block at all never counts as producing. That is what keeps the
   * indicator inside this row instead of a second avatar below it.
   */
  if (role === "assistant" && blocks.length === 0 && !showThinking) {
    return null
  }

  const last = messages[messages.length - 1]

  return (
    <Message align={role === "user" ? "end" : "start"}>
      {role === "assistant" ? <AssistantAvatar /> : null}
      <MessageContent>
        {blocks.map((block) => {
          if (block.kind === "tools") {
            return <ToolGroup key={block.key} parts={block.parts} />
          }

          if (block.kind === "ask") {
            const { part, question } = block
            const answer = askPlayerAnswer(part, question)

            /**
             * Two components rather than one in two states, because an
             * answered question is no longer a form: it is a line of history
             * the player already wrote, and leaving a dead form behind is
             * what made answering fire the questionnaire's own "required"
             * error.
             */
            return answer ? (
              <AskPlayerAnswer
                key={block.key}
                question={question}
                answer={answer}
              />
            ) : (
              <AskPlayer
                key={block.key}
                question={question}
                onAnswer={(output) => onAnswer(part.toolCallId, output)}
              />
            )
          }

          /**
           * An empty text block is what the start of a reply looks like: the
           * part exists before any token has landed in it. Rendering it would
           * put an empty bubble on screen for the length of the round trip.
           */
          if (!block.text.trim()) return null

          const isUser = role === "user"

          return (
            <Bubble
              key={block.key}
              align={isUser ? "end" : "start"}
              variant={isUser ? "default" : "secondary"}
            >
              {/**
               * Only the agent's half is markdown. What the player typed is
               * their own text, and running it through a renderer would
               * reformat it — an asterisk they meant literally would silently
               * turn into emphasis on their own message.
               */}
              <BubbleContent>
                {isUser ? block.text : <Markdown>{block.text}</Markdown>}
              </BubbleContent>
            </Bubble>
          )
        })}
        {showThinking ? <Thinking /> : null}
        {/**
         * Withheld while the turn is still being written. The row would
         * report a token count and a tool tally for a message that is not
         * finished — numbers that are wrong by definition until the turn
         * lands, and that would change under the reader as it streams.
         */}
        {streaming || !last ? null : (
          <MessageActions message={last} copyText={runText(messages)} />
        )}
      </MessageContent>
    </Message>
  )
}

/**
 * Whether the last block of a run is still actively producing — the thing
 * that makes a trailing `<Thinking />` redundant rather than reassuring.
 *
 * Three cases, matching the three ways a block can be "in progress": a text
 * part still being written, a tool group with at least one unsettled call, or
 * a question the agent is waiting on the player to answer. `undefined` (no
 * block at all) and an answered question both read as "not producing" on
 * purpose — the first is the empty-run case handled in `ChatMessageImpl`
 * above, and the second is exactly the resumed-questionnaire gap `Thinking`
 * exists to cover: the run has an answer already sitting in it but nothing
 * new has streamed in since.
 */
function isProducing(block: PartBlock | undefined): boolean {
  if (!block) return false
  /**
   * A text part exists before its first token does, and an empty one renders
   * nothing — so it only counts once there is text on screen to watch grow.
   */
  if (block.kind === "text") {
    return block.state === "streaming" && block.text.trim().length > 0
  }
  if (block.kind === "tools")
    return block.parts.some((part) => !isSettled(part))

  return askPlayerAnswer(block.part, block.question) === null
}

/**
 * Everything a run said, as the reader would paste it — the multi-message
 * counterpart to `messageText` in `message-actions.tsx`. A merged run's copy
 * button has to cover every message in it, not just the one its footer's
 * token count is read from.
 */
function runText(messages: UIMessage[]): string {
  return messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim()
}

/**
 * Compares two runs' messages by identity, element-wise, rather than by
 * reference to the array itself.
 *
 * `groupRuns` rebuilds a fresh `messages` array for every run on every render
 * of `ChatThread` — plain `React.memo`'s shallow prop comparison would see a
 * "new" array every time and re-render every row on every chunk, exactly the
 * cost this memoization exists to avoid. What stays stable is each message
 * *object*: `ReactChatState.replaceMessage` (`@ai-sdk/react`) only ever
 * swaps the one message it updates into a new array, so every other message —
 * and therefore every other row's entire `messages` array, element for
 * element — keeps its old identity. Comparing element-wise is what lets that
 * fact actually skip a re-render instead of being thrown away by the array
 * wrapper around it.
 */
function messagesEqual(a: UIMessage[], b: UIMessage[]): boolean {
  if (a.length !== b.length) return false

  return a.every((message, index) => message === b[index])
}

export const ChatMessage = memo(ChatMessageImpl, (prev, next) => {
  return (
    prev.role === next.role &&
    prev.streaming === next.streaming &&
    prev.onAnswer === next.onAnswer &&
    messagesEqual(prev.messages, next.messages)
  )
})
