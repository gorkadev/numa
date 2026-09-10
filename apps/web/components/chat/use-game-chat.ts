"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai"

import { sentAtMetadata } from "@/lib/ai/message-meta"
import { gameModelMetadata, readThreadModel } from "@/lib/ai/message-model"
import { DEFAULT_GAME_MODEL_ID, type GameModelId } from "@/lib/ai/model-catalog"
import { withoutContinuationOf } from "@/lib/ai/resume-stream"
import {
  mintGameChatAccessToken,
  startGameChatSession,
} from "@/lib/games/chat-actions"
import { readGameRevision } from "@/lib/games/revision"
import type { AskPlayerOutput } from "@/lib/games/tools"
import { readTurnCredits } from "@/lib/games/turn-credits"
import { publishTurnCredits } from "@/lib/polar/credits-channel"
import type { gameChat } from "@/trigger/chat"

/**
 * Everything stateful about a game's chat: the transport, the stream, the
 * model picker, and the effect that sends a freshly created game's first
 * prompt. Split out of `ChatThread` so that component can stay what it reads
 * as — a container that renders what this hook hands it — while every piece
 * here keeps the comments explaining why it exists the way it does.
 */
export function useGameChat({
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
   * back; nothing is lost either way, which is the trade this makes. See
   * `components/chat/chat-thread.tsx`'s `groupRuns` for the render-time half
   * of that trade — it folds the two messages back into one row so the split
   * is invisible before the reload ever happens.
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
       * Caps how often a streaming turn hands `messages` back to React —
       * `throttle` is the current name for this option; the installed
       * `@ai-sdk/react` still accepts `experimental_throttle` too, but only as
       * a deprecated alias for the same thing (see its `.d.ts`). Every network
       * chunk otherwise triggers its own render of the whole thread, which
       * re-runs `groupParts` and re-parses markdown for every row on screen —
       * 50ms is short enough that typing still feels live, long enough that a
       * fast stream stops re-rendering on every chunk.
       */
      throttle: 50,
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
    sendMessage({ text, metadata: outgoingMetadata(modelId) })
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
      sendMessage({ text: initialPrompt, metadata: outgoingMetadata(modelId) })
    }

    window.history.replaceState(null, "", `/games/${gameId}`)
  }, [gameId, initialMessages.length, initialPrompt, modelId, sendMessage])

  /**
   * A stable per-call answer handler, built once around `addToolOutput`
   * rather than closed over inline per row per render. `AskPlayer` needs a
   * `toolCallId`-scoped callback, but that scoping happens at the call site
   * in `chat-message.tsx` (`() => onAnswer(part.toolCallId, output)`) so this
   * hook's own return value — the thing every row's memo comparator checks —
   * never changes identity across renders.
   */
  const onAnswer = useCallback(
    (toolCallId: string, output: AskPlayerOutput) => {
      addToolOutput({ tool: "ask_player", toolCallId, output })
    },
    [addToolOutput]
  )

  return {
    messages,
    status,
    error,
    stop,
    onAnswer,
    send: handleSubmit,
    modelId,
    setModelId,
    pending,
    input,
    setInput,
  }
}

/**
 * What an outgoing message carries: the model it is being sent to, and the
 * moment the player sent it.
 *
 * One function so the two never disagree about which messages get stamped —
 * every send goes through here, and the thread's footer relies on `sentAt`
 * existing on anything the browser produced.
 */
function outgoingMetadata(model: GameModelId) {
  return { ...gameModelMetadata(model), ...sentAtMetadata() }
}
