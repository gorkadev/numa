/** How long to wait for a section that loads its data before giving up on the row. */
const REVEAL_TIMEOUT_MS = 8000

const HIT_COLOR = "color-mix(in oklab, var(--primary) 18%, transparent)"

/**
 * Scrolls the dialog to the row or group a search result names and flashes it
 * once. A section that fetches its data (Billing, Sessions) renders the row
 * late, so this waits for it to appear instead of looking only once.
 * Returns a cleanup that stops waiting.
 */
export function revealSetting(container: HTMLElement, id: string): () => void {
  const selector = `[data-setting-id="${CSS.escape(id)}"]`
  const find = () => container.querySelector<HTMLElement>(selector)

  const found = find()
  if (found) {
    show(found)
    return () => {}
  }

  const observer = new MutationObserver(() => {
    const element = find()
    if (!element) return
    stop()
    show(element)
  })
  const timer = window.setTimeout(stop, REVEAL_TIMEOUT_MS)
  observer.observe(container, { childList: true, subtree: true })

  function stop() {
    observer.disconnect()
    window.clearTimeout(timer)
  }

  return stop
}

function show(element: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })

  /**
   * A row sits inside its group's clipped, rounded box, so a background is
   * enough. A whole group has no box of its own, so it gets a soft ring that
   * reaches past its heading.
   */
  const isRow = element.dataset.slot === "item"
  const from = isRow
    ? { backgroundColor: HIT_COLOR }
    : { backgroundColor: HIT_COLOR, boxShadow: `0 0 0 8px ${HIT_COLOR}`, borderRadius: "16px" }
  const to = isRow
    ? { backgroundColor: "transparent" }
    : { backgroundColor: "transparent", boxShadow: "0 0 0 8px transparent", borderRadius: "16px" }

  element.animate([from, { ...from, offset: 0.4 }, to], {
    duration: reduced ? 1200 : 1800,
    easing: "ease-out",
  })
}
