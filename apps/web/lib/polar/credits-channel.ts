/**
 * How a finished turn reaches the credit counter in the sidebar.
 *
 * The two components are in different subtrees and always will be: the chat is
 * page content, the sidebar is application chrome, and their only common
 * ancestor is a server layout. Threading a callback between them means a
 * client provider wrapped around the whole shell whose sole job is to relay
 * one number, plus a prop drilled through every intermediate component — a
 * permanent piece of architecture bought to carry an occasional notification.
 *
 * So the notification travels the way notifications do in a browser: as an
 * event on `window`. Both ends stay independent — the chat does not know a
 * sidebar exists, the sidebar does not know which page is publishing — and
 * either can be mounted without the other, which is exactly what happens on
 * every page that is not a game.
 *
 * The event name and its payload are spelled ONCE, here, and reached only
 * through these two functions. That is what separates this from a stringly
 * typed event bus: there is no place in the application where a typo compiles.
 */
const EVENT = "numa:turn-credits"

/**
 * Announces what the turn that just finished spent.
 *
 * A no-op on the server rather than a crash: this is called from a `useChat`
 * callback, which only ever runs in the browser, but the module is imported by
 * components that also render on the server.
 */
export function publishTurnCredits(credits: number): void {
  if (typeof window === "undefined") return

  window.dispatchEvent(new CustomEvent(EVENT, { detail: credits }))
}

/**
 * Subscribes to turn costs. Returns the unsubscribe, so it drops straight into
 * an effect.
 */
export function onTurnCredits(handler: (credits: number) => void): () => void {
  const listener = (event: Event) => {
    const { detail } = event as CustomEvent<unknown>

    if (typeof detail === "number") handler(detail)
  }

  window.addEventListener(EVENT, listener)

  return () => window.removeEventListener(EVENT, listener)
}
