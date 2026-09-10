"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import {
  Alert01Icon,
  ArrowDown01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
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
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@workspace/ui/components/questionnaire"
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
import { Markdown } from "@/components/markdown"
import { gameModelMetadata, readThreadModel } from "@/lib/ai/message-model"
import { DEFAULT_GAME_MODEL_ID, type GameModelId } from "@/lib/ai/model-catalog"
import {
  mintGameChatAccessToken,
  startGameChatSession,
} from "@/lib/games/chat-actions"
import { readGameRevision } from "@/lib/games/revision"
import type { AskPlayerOutput } from "@/lib/games/tools"
import { readTurnCredits } from "@/lib/games/turn-credits"
import { publishTurnCredits } from "@/lib/polar/credits-channel"
import type { gameChat } from "@/trigger/chat"

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
  const [input, setInput] = useState("")

  /**
   * The model the next turn is sent with. It lives here rather than in the
   * composer because this is the component holding the transport: the picker
   * changes a value the agent has to receive, not a piece of local form state.
   *
   * Per turn, not per chat — the transport reads it on every send, so a thread
   * can be started on one model and continued on another.
   *
   * Restored from the thread first, because that is where the choice was
   * recorded: the agent stamps the model every turn ran with onto that turn's
   * last message, so a reload picks the conversation back up on the model it
   * was actually running — including a turn that only answered an `ask_player`
   * question, which sends no message of its own to hang the choice on. The
   * query string is only the brand-new game's case, when there is no message to
   * read it off yet.
   */
  const [modelId, setModelId] = useState<GameModelId>(
    () =>
      readThreadModel(initialMessages) ??
      initialModelId ??
      DEFAULT_GAME_MODEL_ID
  )

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
    /**
     * The player's choice, on its way to the agent's `clientDataSchema` as
     * per-turn metadata. The hook keeps this option in a ref, so switching
     * models takes effect on the next send without rebuilding the transport
     * or disturbing the stream in flight.
     */
    clientData: { model: modelId },
    sessions: initialSessions,
  })

  /**
   * The message a resumed stream might be continuing, read once on mount.
   *
   * Only a thread already sitting on an assistant message has one, and the
   * resume happens on mount, so nothing arriving later can change the answer.
   */
  const [resumedHeadId] = useState(() => {
    const last = initialMessages.at(-1)

    return last?.role === "assistant" ? last.id : undefined
  })

  /**
   * The transport `useChat` actually talks to: the real one, with the single
   * chunk that would erase the answered question taken out of a resumed
   * stream.
   *
   * Answering `ask_player` does not open a new assistant message — the agent
   * wakes and carries on writing into the one that asked. So the resumed turn
   * opens by naming that message's id, and `ai` reads the id as "this is that
   * message": a resume builds its copy from empty (`lastMessage: undefined` in
   * `Chat.makeRequest`), and on the first `write` the id matches, so
   * `replaceMessage` swaps the thread's complete copy for one holding only
   * what arrived after the reconnect cursor. The question and the player's
   * answer are what that swap drops — which is why this is only ever visible
   * while a turn is still streaming.
   *
   * Dropping the `start` chunk leaves `ai` on the id it generated itself, so
   * the rest of the turn lands beside the question instead of on top of it.
   * One turn then reads as two messages until the next reload merges them
   * back; nothing is lost either way, which is the trade this makes.
   *
   * Both forwarded methods are arrow-function class properties on
   * `TriggerChatTransport`, so they carry their own `this` and survive being
   * pulled off the instance.
   */
  const chatTransport = useMemo(
    () => ({
      sendMessages: transport.sendMessages,
      reconnectToStream: async (
        options: Parameters<typeof transport.reconnectToStream>[0]
      ) => {
        const stream = await transport.reconnectToStream(options)

        return stream && resumedHeadId
          ? stream.pipeThrough(withoutContinuationOf(resumedHeadId))
          : stream
      },
    }),
    [transport, resumedHeadId]
  )

  const { messages, sendMessage, addToolOutput, stop, status, error } = useChat(
    {
      id: gameId,
      messages: initialMessages,
      transport: chatTransport,
      /**
       * Restarts the agent once every pending tool call has an answer.
       *
       * `ask_player` has no `execute`, so the turn it was called in ended with
       * the call unanswered and the run suspended. `addToolOutput` fills the
       * answer in locally but sends nothing by itself — without this the player
       * would pick an option, see it selected, and wait forever.
       */
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
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

        /**
         * The credit cost of the turn goes straight to the sidebar rather than
         * through a prop or a callback on this component: the counter is
         * application chrome and this is page content, so they have no shared
         * ancestor that is not the server layout. See
         * `lib/polar/credits-channel.ts`.
         *
         * Not an `else if`. A turn writes both parts and the two are unrelated
         * facts — one says the game changed, the other says what it cost —
         * so chaining them would make the credit update depend on whether any
         * file happened to be written.
         */
        const credits = readTurnCredits(part)

        if (credits !== null) publishTurnCredits(credits)
      },
    }
  )

  const pending = status === "submitted" || status === "streaming"

  /**
   * The metadata records the choice on the message itself, which is what the
   * next mount reads back rather than starting over on the default. It covers
   * only the turns that send a message, so the agent re-stamps it from
   * `clientData` on every turn; both are set from this same state, so they
   * cannot disagree.
   */
  function handleSubmit(text: string) {
    sendMessage({ text, metadata: gameModelMetadata(modelId) })
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
      sendMessage({ text: initialPrompt, metadata: gameModelMetadata(modelId) })
    }

    window.history.replaceState(null, "", `/games/${gameId}`)
  }, [gameId, initialMessages.length, initialPrompt, modelId, sendMessage])

  /**
   * Whether the agent has been handed the turn but has not put anything on
   * screen yet.
   *
   * The gap this covers is real and easily a few seconds long: the request is
   * away, the assistant row is on screen, and the first token — which for this
   * agent is usually a tool call, not a word — has not arrived. Left alone the
   * thread shows an avatar next to nothing, which reads as broken rather than
   * as working.
   */
  const waiting =
    pending &&
    (() => {
      const last = messages.at(-1)

      if (!last || last.role !== "assistant") return true

      return !last.parts.some(
        (part) => isToolUIPart(part) || part.type === "text"
      )
    })()

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
              {messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  /**
                   * A turn starts where the player asked for something, so
                   * their message is what the viewport anchors on — the reply
                   * then streams below it rather than shoving it off screen.
                   */
                  scrollAnchor={message.role === "user"}
                >
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
                      {groupParts(message.parts).map((block) => {
                        if (block.kind === "tools") {
                          return (
                            <ToolGroup key={block.key} parts={block.parts} />
                          )
                        }

                        if (block.kind === "ask") {
                          const { part, question } = block
                          const answer = askPlayerAnswer(part, question)

                          /**
                           * Two components rather than one in two states,
                           * because an answered question is no longer a form:
                           * it is a line of history the player already wrote,
                           * and leaving a dead form behind is what made
                           * answering fire the questionnaire's own "required"
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
                              onAnswer={(output) =>
                                addToolOutput({
                                  tool: "ask_player",
                                  toolCallId: part.toolCallId,
                                  output,
                                })
                              }
                            />
                          )
                        }

                        /**
                         * An empty text block is what the start of a reply
                         * looks like: the part exists before any token has
                         * landed in it. Rendering it would put an empty
                         * bubble on screen for the length of the round trip.
                         */
                        if (!block.text.trim()) return null

                        const isUser = message.role === "user"

                        return (
                          <Bubble
                            key={block.key}
                            align={isUser ? "end" : "start"}
                            variant={isUser ? "default" : "secondary"}
                          >
                            {/**
                             * Only the agent's half is markdown. What the
                             * player typed is their own text, and running it
                             * through a renderer would reformat it — an
                             * asterisk they meant literally would silently
                             * turn into emphasis on their own message.
                             */}
                            <BubbleContent>
                              {isUser ? (
                                block.text
                              ) : (
                                <Markdown>{block.text}</Markdown>
                              )}
                            </BubbleContent>
                          </Bubble>
                        )
                      })}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
              {waiting ? (
                <MessageScrollerItem>
                  <Message align="start">
                    <MessageAvatar className="bg-transparent p-1">
                      <Image
                        src="/logo.svg"
                        alt="Numa"
                        width={20}
                        height={24}
                      />
                    </MessageAvatar>
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
          onSubmit={handleSubmit}
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

/**
 * Takes the chunk that would erase a message out of the stream a reload
 * resumes.
 *
 * Scoped to the one id that was already on screen when the page rendered:
 * every other `start` chunk names a message the thread does not have yet, and
 * dropping those would cost the turn its own identity for no reason.
 */
function withoutContinuationOf(messageId: string) {
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "start" && chunk.messageId === messageId) return

      controller.enqueue(chunk)
    },
  })
}

/**
 * The name the questionnaire gives its one field.
 *
 * The primitive is a real `<form>` and its choices are real radio inputs named
 * after the item, so the answer is read back out of `FormData` rather than
 * mirrored into React state. One field per form, and each question renders its
 * own form, so a fixed name is unambiguous.
 */
const ASK_FIELD = "answer"

type AskOption = { id: string; label: string; description?: string }
type AskQuestion = { question: string; options: AskOption[] }

/**
 * The question inside an `ask_player` call, once there is enough of one to
 * put in front of the player.
 *
 * Everything here is defensive on purpose. Tool input arrives as partially
 * parsed JSON while the model streams its arguments, so a call in flight
 * legitimately has no `question` yet and an `options` array with one
 * half-written entry in it. Returning `null` until the whole thing is present
 * is what keeps a question from appearing a word at a time and an option from
 * being clickable before it has a label.
 *
 * The lower bound of two also protects the interaction rather than the types:
 * a single-option question is not a choice, and rendering it would ask the
 * player to rubber-stamp a decision the model already made.
 */
function askPlayerQuestion(
  part: ToolUIPart | DynamicToolUIPart
): AskQuestion | null {
  if (getToolName(part) !== "ask_player") return null
  if (part.state === "output-error" || part.state === "output-denied") {
    return null
  }

  const input = part.input

  if (typeof input !== "object" || input === null) return null

  const { question, options } = input as {
    question?: unknown
    options?: unknown
  }

  if (typeof question !== "string" || question.length === 0) return null
  if (!Array.isArray(options) || options.length < 2) return null

  const parsed: AskOption[] = []

  for (const option of options) {
    if (typeof option !== "object" || option === null) return null

    const { id, label, description } = option as {
      id?: unknown
      label?: unknown
      description?: unknown
    }

    if (typeof id !== "string" || id.length === 0) return null
    if (typeof label !== "string" || label.length === 0) return null

    parsed.push({
      id,
      label,
      description: typeof description === "string" ? description : undefined,
    })
  }

  return { question, options: parsed }
}

/**
 * The option already chosen, when this question has been answered.
 *
 * Resolved back to the option the model offered rather than trusting the
 * stored output on its own: the label is echoed into the result so a replayed
 * thread reads as a conversation, but the description only ever lived in the
 * question, and that is what makes the record worth showing.
 *
 * Falling back to the raw label matters for a question whose options were
 * edited out from under an answer — the choice still happened, and dropping it
 * would silently rewrite what the player decided.
 */
function askPlayerAnswer(
  part: ToolUIPart | DynamicToolUIPart,
  question: AskQuestion
): AskOption | null {
  if (part.state !== "output-available") return null

  const output = part.output

  if (typeof output !== "object" || output === null) return null

  const { optionId, label } = output as { optionId?: unknown; label?: unknown }

  if (typeof optionId !== "string" || optionId.length === 0) return null

  const chosen = question.options.find((option) => option.id === optionId)

  if (chosen) return chosen

  return typeof label === "string" && label.length > 0
    ? { id: optionId, label }
    : null
}

/**
 * The question the agent stopped its turn to ask, while it is still open.
 *
 * Answering is a submit rather than a click on an option. A radio group the
 * player can revise before committing is the honest shape for a decision that
 * cannot be taken back — once the answer goes to the agent it becomes the
 * premise of everything it builds next.
 */
function AskPlayer({
  question,
  onAnswer,
}: {
  question: AskQuestion
  onAnswer: (answer: AskPlayerOutput) => void
}) {
  return (
    <Bubble variant="muted" align="start" className="w-full max-w-full">
      <BubbleContent className="w-full !bg-transparent p-4 dark:!bg-card">
        <Questionnaire
          /**
           * Number keys pick an option, Enter commits. The primitive scopes
           * both to this form, so an old question further up the thread never
           * competes with the composer for a keystroke.
           */
          shortcuts="numbers"
          onSubmit={(event) => {
            event.preventDefault()

            const chosen = new FormData(event.currentTarget).get(ASK_FIELD)
            const option = question.options.find((it) => it.id === chosen)

            if (option) {
              onAnswer({ optionId: option.id, label: option.label })
            }
          }}
        >
          <QuestionnaireItem name={ASK_FIELD} required>
            <QuestionnaireTitle>{question.question}</QuestionnaireTitle>
            <QuestionnaireChoices>
              {question.options.map((option) => (
                <QuestionnaireChoice key={option.id} value={option.id}>
                  {option.label}
                  {option.description ? (
                    <QuestionnaireChoiceDescription>
                      {option.description}
                    </QuestionnaireChoiceDescription>
                  ) : null}
                </QuestionnaireChoice>
              ))}
            </QuestionnaireChoices>
            <QuestionnaireError />
            <QuestionnaireActions>
              <QuestionnaireSubmit size="sm">Continue</QuestionnaireSubmit>
            </QuestionnaireActions>
          </QuestionnaireItem>
        </Questionnaire>
      </BubbleContent>
    </Bubble>
  )
}

/**
 * The same question once it has been answered — a record, not a control.
 *
 * Deliberately not the form in a disabled state. Keeping the radio group
 * around costs the thread a full-height card for every question ever asked,
 * and it lies twice: the options read as offers that are no longer on the
 * table, and the primitive itself stops counting a disabled choice as an
 * answer — which flips the item back to "unanswered" and fires the required
 * error the instant the answer is accepted.
 *
 * A thread is re-rendered from stored history on every reload, so this is what
 * an answered question looks like for the rest of the chat's life. It carries
 * the question as well as the answer, because a bare "Survival Adventure" is
 * not a conversation.
 */
function AskPlayerAnswer({
  question,
  answer,
}: {
  question: AskQuestion
  answer: AskOption
}) {
  return (
    <Bubble variant="muted" align="start" className="w-full max-w-full">
      <BubbleContent className="flex w-full flex-col gap-2 p-4 dark:!bg-card">
        <p className="text-sm text-pretty text-muted-foreground">
          {question.question}
        </p>
        <p className="flex items-start gap-2 text-sm font-medium">
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className="size-4 shrink-0 translate-y-0.5 text-primary"
          />
          <span className="min-w-0">
            You chose {answer.label}
            {answer.description ? (
              <span className="block font-normal text-muted-foreground">
                {answer.description}
              </span>
            ) : null}
          </span>
        </p>
      </BubbleContent>
    </Bubble>
  )
}

/**
 * A message's parts, folded into the blocks the thread actually renders.
 *
 * The one thing this does that a `parts.map` cannot: it coalesces a run of
 * consecutive tool calls into a single block. A turn that touches a dozen
 * files produces a dozen parts, and listing them costs the thread a screen of
 * scrolling to say "it worked on the game" — while the reply that explains
 * what changed gets pushed out of view.
 *
 * Consecutive is the whole rule. A tool call that comes after the agent has
 * said something belongs to a new group, because the sentence in between is
 * what makes it a separate stretch of work rather than more of the same one.
 *
 * `ask_player` never joins a group: it is the turn handing control back, not a
 * step to summarise. A call still streaming its arguments has no question yet
 * and stays with the tools, where it reads as "thinking it over" until the
 * question is whole.
 */
type PartBlock =
  | { kind: "text"; key: string; text: string }
  | { kind: "tools"; key: string; parts: (ToolUIPart | DynamicToolUIPart)[] }
  | {
      kind: "ask"
      key: string
      part: ToolUIPart | DynamicToolUIPart
      question: AskQuestion
    }

function groupParts(parts: UIMessage["parts"]): PartBlock[] {
  const blocks: PartBlock[] = []

  parts.forEach((part, index) => {
    if (isToolUIPart(part)) {
      const question = askPlayerQuestion(part)

      if (question) {
        blocks.push({ kind: "ask", key: part.toolCallId, part, question })
        return
      }

      const open = blocks.at(-1)

      if (open?.kind === "tools") {
        open.parts.push(part)
        return
      }

      blocks.push({ kind: "tools", key: part.toolCallId, parts: [part] })
      return
    }

    if (part.type !== "text") return

    blocks.push({ kind: "text", key: `text-${index}`, text: part.text })
  })

  return blocks
}

/**
 * What the thread says while the agent has the turn and nothing to show yet.
 *
 * The phrases rotate because a line that never changes stops reading as
 * activity after the first few seconds — it reads as a stuck screen. They are
 * deliberately vague: this is the stretch before the first token, so the only
 * honest thing to say is that the agent is working, and a specific claim here
 * would be one nothing has happened to justify.
 */
const THINKING_PHRASES = [
  "Thinking",
  "Working out what to change",
  "Planning the edit",
  "Getting to it",
]

const THINKING_INTERVAL = 2600

function Thinking() {
  const [phrase, setPhrase] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setPhrase((it) => (it + 1) % THINKING_PHRASES.length),
      THINKING_INTERVAL
    )

    return () => clearInterval(timer)
  }, [])

  return (
    <Marker role="status" aria-live="polite">
      <MarkerIcon>
        <Spinner />
      </MarkerIcon>
      <MarkerContent className="shimmer">
        {THINKING_PHRASES[phrase]}…
      </MarkerContent>
    </Marker>
  )
}

/**
 * A run of tool calls, as one line the reader can open.
 *
 * Collapsed by default once it is done, because a finished group is a fact
 * about the past — "it read nine files" — and the reply underneath is what the
 * player actually wants. Open it and every call is there, unchanged.
 *
 * While the group is still running the header shows the call in flight rather
 * than a count, so the thread reports what is happening now instead of how
 * much has happened so far.
 *
 * A group that contains a failure says so in the header and tints itself,
 * because that is the one thing summarising must never bury: a turn that
 * failed halfway looks identical to a turn that worked, once you have replaced
 * its steps with a number.
 */
function ToolGroup({ parts }: { parts: (ToolUIPart | DynamicToolUIPart)[] }) {
  const [open, setOpen] = useState(false)

  const active = parts.find((part) => !isSettled(part))
  const failed = parts.filter((part) => toolError(part) !== null).length

  /**
   * One call is not a group. Summarising it would replace a line that says
   * what happened with a line that says how many things happened, and the
   * answer would always be one.
   */
  if (parts.length === 1 && parts[0]) {
    return <ToolMarker part={parts[0]} />
  }

  const label = active
    ? toolLabel(active)
    : `${parts.some((part) => MUTATING_TOOLS.has(getToolName(part))) ? "Edited" : "Read"} ${parts.length} files`

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        /**
         * A real `<button>` underneath, not a clickable div: the trigger
         * assumes a native button (`nativeButton` defaults true) and leaves
         * keyboard handling to it, so rendering `Marker`'s default `div` here
         * would produce a control the keyboard cannot reach.
         */
        render={
          <Marker
            render={<button type="button" />}
            className={`w-auto cursor-pointer hover:text-foreground${
              failed > 0 ? "text-destructive" : ""
            }`}
          />
        }
      >
        <MarkerIcon>
          {active ? (
            <Spinner />
          ) : failed > 0 ? (
            <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
          )}
        </MarkerIcon>
        <MarkerContent className={active ? "shimmer" : undefined}>
          {label}
          {!active && failed > 0 ? `, ${failed} failed` : null}
        </MarkerContent>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="ms-auto shrink-0 transition-transform group-data-[panel-open]/marker:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-col gap-1 border-s border-border ps-3">
        {parts.map((part) => (
          <ToolMarker key={part.toolCallId} part={part} />
        ))}
      </CollapsibleContent>
    </Collapsible>
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
  /**
   * Only ever seen while the model is still writing the question — once the
   * arguments are complete the call renders as the questionnaire instead.
   */
  ask_player: { active: "Thinking it over", done: "Asked you a question" },
  read_file: { active: "Reading", done: "Read" },
  list_files: { active: "Looking at the game", done: "Looked at the game" },
  write_file: { active: "Writing", done: "Wrote" },
  replace_text: { active: "Editing", done: "Edited" },
  delete_file: { active: "Deleting", done: "Deleted" },
}

/**
 * The tools that changed the game rather than looked at it.
 *
 * Deliberately a second copy of the set in `trigger/chat.ts` rather than an
 * import: that module is the agent task, and pulling it into a client
 * component would drag the Daytona SDK into the browser bundle. The two lists
 * answer different questions — that one decides whether to reload the preview,
 * this one decides a word in a summary — and neither breaks quietly if they
 * drift.
 */
const MUTATING_TOOLS = new Set(["write_file", "replace_text", "delete_file"])

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
 * Whether a tool call has finished, however it finished.
 *
 * Collapses the SDK's seven states into the one distinction the thread draws:
 * it is still happening, or it is not. The states beyond these — approval
 * requested, responded, denied — cannot occur here because no tool is
 * configured to require approval, but they resolve rather than crash if that
 * ever changes.
 */
function isSettled(part: ToolUIPart | DynamicToolUIPart): boolean {
  return (
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"
  )
}

/**
 * Why a completed tool call did not actually succeed, if it did not.
 *
 * The subtle part of this whole component. The game tools return their
 * failures as an `{ error }` result instead of throwing, so the model can read
 * the message and correct itself without the turn dying — which means a failed
 * call arrives as `output-available`, the same state as a successful one.
 * Checking only for `output-error` would render every one of those failures as
 * a tick, and quietly tell the user a file was written when it was not.
 */
function toolError(part: ToolUIPart | DynamicToolUIPart): string | null {
  if (part.state === "output-error") return part.errorText
  if (part.state === "output-denied") return "Not allowed"
  if (part.state === "output-available") return outputError(part.output)

  return null
}

/** What this call reads as right now: a verb, and the file it is about. */
function toolLabel(part: ToolUIPart | DynamicToolUIPart): string {
  const name = getToolName(part)
  const labels = TOOL_LABELS[name] ?? { active: name, done: name }
  const path = toolPath(part.input)

  return `${isSettled(part) ? labels.done : labels.active}${path ? ` ${path}` : ""}`
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
  const error = toolError(part)
  const settled = isSettled(part)
  const label = toolLabel(part)

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
