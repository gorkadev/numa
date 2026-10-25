/**
 * Wraps a chat transport's `sendMessages` so the page's abort signal never
 * reaches it.
 *
 * `useChat` aborts its request whenever the hook unmounts — leaving a game's
 * page for another chat is enough — and the Trigger transport turns any
 * abort of that signal into a `stop` for the agent (`sendStopOnAbort`). A
 * build the player merely walked away from was being cancelled 40 seconds
 * in. Without the signal the turn keeps running on the server and the player
 * catches up on return; a deliberate stop goes through the transport's own
 * `stopGeneration` instead (`use-game-chat.ts`'s `stopBuild`).
 */
export function detachedSend<Options extends { abortSignal?: AbortSignal }, Result>(
  send: (options: Options) => Promise<Result>
): (options: Options) => Promise<Result> {
  return (options) => send({ ...options, abortSignal: undefined })
}
