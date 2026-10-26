/**
 * The new-game composer's unsent text, kept in sessionStorage so a reload or a
 * trip to another page does not lose it. There is only ever one draft: typing
 * replaces it, the command palette's "Open in composer" overwrites it, and
 * sending clears it.
 *
 * sessionStorage, not localStorage: it belongs to the tab, so two tabs never
 * overwrite each other's draft. Every access is guarded — storage can be
 * blocked or unavailable, and a draft is a convenience, never a reason to fail.
 */

const KEY = "numa:new-game-draft"
const REPLACED = "numa:new-game-draft-replaced"

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export function createDraftStore(
  storage: () => DraftStorage | null,
  events: EventTarget
) {
  function guard<T>(action: (store: DraftStorage) => T, fallback: T): T {
    try {
      const store = storage()
      return store ? action(store) : fallback
    } catch {
      return fallback
    }
  }

  function write(text: string) {
    guard((store) => {
      if (text) store.setItem(KEY, text)
      else store.removeItem(KEY)
    }, undefined)
  }

  return {
    read: () => guard((store) => store.getItem(KEY) ?? "", ""),
    write,
    clear: () => write(""),
    /**
     * The palette's hand-off. It also tells a composer that is already on
     * screen, because navigating to the page it is on does not remount it.
     */
    replace(text: string) {
      write(text)
      events.dispatchEvent(new CustomEvent(REPLACED, { detail: text }))
    },
    subscribe(listener: (text: string) => void) {
      const handle = (event: Event) =>
        listener(String((event as CustomEvent<string>).detail))
      events.addEventListener(REPLACED, handle)

      return () => events.removeEventListener(REPLACED, handle)
    },
  }
}

/** The browser's draft; on the server it reads as empty and does nothing. */
export const newGameDraft = createDraftStore(
  () => (typeof window === "undefined" ? null : window.sessionStorage),
  typeof window === "undefined" ? new EventTarget() : window
)
