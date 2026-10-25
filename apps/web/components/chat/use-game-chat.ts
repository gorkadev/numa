"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai"

import { sentAtMetadata, withoutLiveReceipts } from "@/lib/ai/message-meta"
import { readThreadTier, tierMetadata } from "@/lib/ai/message-model"
import { DEFAULT_TIER_ID, type TierId } from "@/lib/ai/model-catalog"
import { withoutContinuationOf } from "@/lib/ai/resume-stream"
import {
  mintGameChatAccessToken,
  startGameChatSession,
} from "@/lib/games/chat-actions"
import {
  readGameProgress,
  reduceGameBuildProgress,
  withoutGameProgress,
  type GameBuildProgressEvent,
} from "@/lib/games/build-progress"
import { readContextUsage, type ContextUsage } from "@/lib/games/context-usage"
import { detachedSend } from "@/lib/games/detached-send"
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
  initialTierId,
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
   * The tier the home screen's picker was on, handed over in the query string
   * beside the prompt it created the game with. It seeds the picker here so the
   * first turn is sent with what the player actually chose; from then on this
   * thread's own picker owns the value, which is why it is only the initial
   * one and not a controlled prop.
   */
  initialTierId?: TierId
  /**
   * Reports the revision the agent stamps on a turn that changed the game's
   * files. The thread owns the stream, but the preview is its sibling, so the
   * signal is handed up rather than acted on here.
   */
  onRevision?: (revision: number) => void
}) {
  const [input, setInput] = useState("")
  const reconnectAttempt = useRef({
    gameId: null as string | null,
    id: 0,
    receivedPhase: false,
  })
  const progressTurn = useRef(0)
  const statusTransition = useRef<{
    gameId: string
    status: "submitted" | "streaming" | "ready" | "error" | null
  }>({ gameId, status: null })
  const [buildProgress, setBuildProgress] = useState<ReturnType<
    typeof reduceGameBuildProgress
  >>(null)
  const dispatchBuildProgress = useCallback((event: GameBuildProgressEvent) => {
    if (event.type === "submit") progressTurn.current += 1
    setBuildProgress((current) => reduceGameBuildProgress(current, event))
  }, [])
  const threadMessages = useMemo(() => withoutGameProgress(initialMessages), [initialMessages])
  const [failureKind, setFailureKind] = useState<ChatFailureKind>(null)
  /**
   * The orchestrator's latest context reading from the stream. Kept apart from
   * `messages` because the part is transient; the durable copy rides on each
   * reply's metadata and covers a reload (see `latestContextUsage`).
   */
  const [liveContext, setLiveContext] = useState<ContextUsage | null>(null)

  /**
   * The tier the next turn is sent with. It lives here rather than in the
   * composer because this is the component holding the transport: the picker
   * changes a value the agent has to receive, not a piece of local form state.
   *
   * Per turn, not per chat — the transport reads it on every send, so a thread
   * can be started on one tier and continued on another.
   *
   * Restored from the thread first, because that is where the choice was
   * recorded: the agent stamps the tier every turn ran with onto that turn's
   * last message, so a reload picks the conversation back up on the tier it
   * was actually running — including a turn that only answered an `ask_player`
   * question, which sends no message of its own to hang the choice on. The
   * query string is only the brand-new game's case, when there is no message to
   * read it off yet.
   */
  const [tierId, setTierId] = useState<TierId>(
    () => readThreadTier(threadMessages) ?? initialTierId ?? DEFAULT_TIER_ID
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
     * tiers takes effect on the next send without rebuilding the transport
     * or disturbing the stream in flight.
     */
    clientData: { tier: tierId },
    sessions: initialSessions,
  })

  /**
   * The message a resumed stream might be continuing, read once on mount.
   *
   * Only a thread already sitting on an assistant message has one, and the
   * resume happens on mount, so nothing arriving later can change the answer.
   */
  const streamFound = useRef<(() => void) | undefined>(undefined)

  const [resumedHeadId] = useState(() => {
    const last = threadMessages.at(-1)

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
      sendMessages: detachedSend(transport.sendMessages),
      reconnectToStream: async (
        options: Parameters<typeof transport.reconnectToStream>[0]
      ) => {
        const stream = await transport.reconnectToStream(options)

        if (stream) streamFound.current?.()

        return stream && resumedHeadId
          ? stream.pipeThrough(withoutContinuationOf(resumedHeadId))
          : stream
      },
    }),
    [transport, resumedHeadId]
  )

  const {
    messages,
    sendMessage,
    addToolOutput,
    stop,
    status,
    error,
    resumeStream,
    setMessages,
  } = useChat({
    id: gameId,
    messages: threadMessages,
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
     * Off on purpose: the reconnect is issued by the effect below instead.
     * `useChat`'s own `resume` calls `resumeStream()` from an effect with
     * no guard, so any second run of that effect breaks it — StrictMode's
     * development double run, or an `<Activity>` route coming back into
     * view. The second call aborts the first reconnect, and the transport
     * answers the second with `null`, because it still counts the aborted
     * one as the chat's active stream until that stream's async teardown
     * runs. Nothing is left listening, and a turn still streaming when the
     * thread remounts shows none of its parts until a reload.
     */
    resume: false,
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

      const failure = readChatFailureKind(part)

      if (failure !== null) setFailureKind(failure)

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

      const context = readContextUsage(part)

      if (context !== null) setLiveContext(context)

      const phase = readGameProgress(part)

      if (phase !== null) {
        if (reconnectAttempt.current.gameId === gameId) {
          reconnectAttempt.current.receivedPhase = true
        }
        dispatchBuildProgress({ type: "server-phase", phase })
      }
    },
  })

  const pending = status === "submitted" || status === "streaming"

  /**
   * A turn's provisional receipt lives only while its stream does. A stopped
   * turn never receives the final receipt that clears it, and the last
   * provisional chunk can arrive after that receipt, so whatever is left once
   * the stream ends is dropped: the reply keeps only its real receipt.
   */
  useEffect(() => {
    if (pending) return
    setMessages((current) => withoutLiveReceipts(current))
  }, [pending, setMessages])
  const [reconnecting, setReconnecting] = useState(false)

  useEffect(() => {
    const previous = statusTransition.current

    if (previous.gameId !== gameId) {
      statusTransition.current = { gameId, status }
      return
    }

    statusTransition.current = { gameId, status }
    const wasActive = previous.status === "submitted" || previous.status === "streaming"
    const turn = progressTurn.current

    if (wasActive && status === "ready") {
      queueMicrotask(() => {
        if (statusTransition.current.gameId === gameId && progressTurn.current === turn) {
          dispatchBuildProgress({ type: "finish" })
        }
      })
    }

    if (status === "error" || error) {
      queueMicrotask(() => {
        if (statusTransition.current.gameId === gameId) {
          dispatchBuildProgress({ type: "error" })
        }
      })
    }
  }, [dispatchBuildProgress, error, gameId, status])

  useEffect(() => {
    progressTurn.current += 1
    queueMicrotask(() => dispatchBuildProgress({ type: "disconnect" }))
  }, [dispatchBuildProgress, gameId])

  /**
   * Reconnects to a turn that is still streaming when the thread mounts —
   * exactly once per chat, which is the whole point of doing it here rather
   * than through `useChat`'s `resume` (see the comment on that option above).
   *
   * The chat id, rather than a boolean, scopes the one reconnect attempt to
   * its current game. Cleanup invalidates that attempt before a remount or a
   * new game can receive its late callback. A brand-new game has nothing to
   * reconnect to, so it is gated on there being history.
   *
   * `reconnecting` deliberately covers only this initial call. A reconnect
   * without a fresh server phase clears its fallback label when it settles.
   */
  const resumedChatId = useRef<string | null>(null)
  const hasHistory = threadMessages.length > 0

  useEffect(() => {
    if (reconnectAttempt.current.gameId !== gameId) {
      setFailureKind(null)
      reconnectAttempt.current = {
        gameId,
        id: reconnectAttempt.current.id + 1,
        receivedPhase: false,
      }
      setReconnecting(false)
    }

    if (!hasHistory) return
    if (resumedChatId.current === gameId) return

    resumedChatId.current = gameId
    setFailureKind(null)
    const attempt = reconnectAttempt.current.id + 1

    reconnectAttempt.current = { gameId, id: attempt, receivedPhase: false }

    /**
     * Nothing is announced yet. Most mounts have nothing to reconnect to — the
     * last turn finished long ago — and the transport only learns that after a
     * round trip. Flipping `reconnecting` and the build-progress label on
     * before the answer put a "Reconnecting…" line above the composer and a
     * thinking indicator inside the last reply on every entry, then took both
     * away a moment later, which read as flicker. The transport reports back
     * through `streamFound` the moment a live stream does exist.
     */
    streamFound.current = () => {
      const currentAttempt = reconnectAttempt.current

      if (currentAttempt.gameId !== gameId || currentAttempt.id !== attempt) {
        return
      }

      setReconnecting(true)
      dispatchBuildProgress({ type: "reconnect-start" })
    }

    /**
     * Deferred a tick so React's development double mount settles first: its
     * fake unmount runs `useChat`'s cleanup, `chat.stop()`, which aborted a
     * reconnect started on the first mount, and the second mount's reconnect
     * then found the aborted stream still registered in the transport and gave
     * up. Entering a chat whose agent was working showed nothing until reload.
     */
    const resumeTimer = setTimeout(() => void (async () => {
      try {
        await resumeStream()

        const currentAttempt = reconnectAttempt.current
        if (currentAttempt.gameId === gameId && currentAttempt.id === attempt) {
          if (!currentAttempt.receivedPhase) {
            dispatchBuildProgress({ type: "reconnect-end" })
          }
          setReconnecting(false)
        }
      } catch {
        const currentAttempt = reconnectAttempt.current
        if (currentAttempt.gameId === gameId && currentAttempt.id === attempt) {
          dispatchBuildProgress({ type: "disconnect" })
          setReconnecting(false)
        }
      }
    })(), 0)

    return () => {
      clearTimeout(resumeTimer)
      const currentAttempt = reconnectAttempt.current

      if (currentAttempt.gameId === gameId && currentAttempt.id === attempt) {
        reconnectAttempt.current = {
          gameId,
          id: attempt + 1,
          receivedPhase: currentAttempt.receivedPhase,
        }
        resumedChatId.current = null
      }
    }
  }, [dispatchBuildProgress, gameId, hasHistory, resumeStream])

  /**
   * The metadata records the choice on the message itself, which is what the
   * next mount reads back rather than starting over on the default. It covers
   * only the turns that send a message, so the agent re-stamps it from
   * `clientData` on every turn; both are set from this same state, so they
   * cannot disagree.
   */
  function handleSubmit(text: string) {
    dispatchBuildProgress({ type: "submit" })
    setFailureKind(null)
    sendMessage({ text, metadata: outgoingMetadata(tierId) })
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

    if (threadMessages.length === 0) {
      queueMicrotask(() => {
        dispatchBuildProgress({ type: "submit" })
        sendMessage({ text: initialPrompt, metadata: outgoingMetadata(tierId) })
      })
    }

    window.history.replaceState(null, "", `/games/${gameId}`)
  }, [dispatchBuildProgress, gameId, initialPrompt, sendMessage, threadMessages.length, tierId])

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
      setFailureKind(null)
      addToolOutput({ tool: "ask_player", toolCallId, output })
    },
    [addToolOutput]
  )

  const stopBuild = useCallback(() => {
    const reconnect = reconnectAttempt.current
    reconnectAttempt.current = {
      ...reconnect,
      id: reconnect.id + 1,
    }
    progressTurn.current += 1
    setReconnecting(false)
    dispatchBuildProgress({ type: "abort" })
    // The send carries no abort signal (`detachedSend`), so stopping the
    // local stream alone would leave the agent running: stop it explicitly.
    void transport.stopGeneration(gameId)
    stop()
  }, [dispatchBuildProgress, gameId, stop, transport])

  return {
    messages,
    status,
    error,
    buildProgress,
    failureKind,
    liveContext,
    stop: stopBuild,
    onAnswer,
    send: handleSubmit,
    tierId,
    setTierId,
    pending,
    reconnecting,
    input,
    setInput,
  }
}

/**
 * What an outgoing message carries: the tier it is being sent with, and the
 * moment the player sent it.
 *
 * One function so the two never disagree about which messages get stamped —
 * every send goes through here, and the thread's footer relies on `sentAt`
 * existing on anything the browser produced.
 */
function outgoingMetadata(tier: TierId) {
  return { ...tierMetadata(tier), ...sentAtMetadata() }
}

type ChatFailureKind =
  | "credits-unprovisioned"
  | "credits-exhausted"
  | "game-unavailable"
  | null

/** Validate transient application-owned stream data before classifying an error. */
function readChatFailureKind(part: { type: string; data?: unknown }): ChatFailureKind {
  if (part.type === "data-game-unavailable") {
    if (
      typeof part.data === "object" &&
      part.data !== null &&
      "reason" in part.data &&
      part.data.reason === "missing-game"
    ) {
      return "game-unavailable"
    }

    return null
  }

  if (part.type !== "data-credits-exhausted") return null
  if (typeof part.data !== "object" || part.data === null || !("balance" in part.data)) {
    return null
  }

  const { balance } = part.data

  if (balance === null) return "credits-unprovisioned"
  if (typeof balance === "number" && Number.isFinite(balance) && balance <= 0) {
    return "credits-exhausted"
  }

  return null
}
