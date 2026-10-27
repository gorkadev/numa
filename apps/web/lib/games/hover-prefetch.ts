/**
 * How long a pointer must rest on a file before it is worth loading. Long
 * enough that sweeping across the tree or scrolling past names loads
 * nothing, short enough that the file is usually ready by the time the
 * click that follows a deliberate hover lands.
 */
export const HOVER_INTENT_MS = 150

/**
 * Warms a cache from hover intent without ever flooding the network.
 *
 * Three rules keep it cheap, whatever the pointer does:
 * - only a pointer that rests for `HOVER_INTENT_MS` loads anything; moving
 *   on, or leaving (`hover(null)`), cancels the pending load;
 * - a URL loads at most once while it succeeds — the HTTP cache keeps it —
 *   and a failure is forgotten so a later rest can try again;
 * - only one load is ever in flight, and a rest during it is dropped rather
 *   than queued, so a burst of hovers can never become a burst of requests.
 */
export function createHoverPrefetcher(load: (url: string) => Promise<unknown>) {
  const done = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false

  function hover(url: string | null) {
    clearTimeout(timer)
    timer = undefined
    if (url === null || done.has(url)) return

    timer = setTimeout(() => {
      if (inFlight || done.has(url)) return
      inFlight = true
      done.add(url)
      load(url)
        .catch(() => done.delete(url))
        .finally(() => {
          inFlight = false
        })
    }, HOVER_INTENT_MS)
  }

  return { hover }
}
