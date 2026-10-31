/**
 * Progressive enhancement for the landing page. Every piece checks for its
 * markup and does nothing when it is absent, and the page is complete without
 * any of it: links link, the composer submits, every section is visible.
 */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* --------------------------------------------------------------- hero ---- */

/*
  The island is the heaviest thing on the site and nothing above the fold waits
  for it: it downloads alongside the page and is built once the copy has come
  in. A failure leaves the CSS sky, which is a complete hero on its own.
*/
const DIVE_END = 0.65
const ENTRANCE_SETTLED_MS = 850

function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]")
  const stage = hero?.querySelector<HTMLElement>("[data-island]")
  const copy = hero?.querySelector<HTMLElement>("[data-hero-copy]")
  const nav = document.querySelector<HTMLElement>("[data-nav]")
  if (!hero || !stage || !copy) return

  let scene: import("./island-scene").IslandScene | null = null
  let progress = 0

  /*
    One read per frame, through requestAnimationFrame, rather than work on
    every scroll event (skill B7).
  */
  let queued = false
  function measure() {
    queued = false
    const rect = hero!.getBoundingClientRect()
    const travel = Math.max(1, rect.height - window.innerHeight)
    /* The dive ends early, so the framed island holds before the page moves on. */
    progress = Math.min(1, Math.max(0, -rect.top / travel) / DIVE_END)
    scene?.setProgress(progress)
    /* The bar stays transparent for as long as the sky is behind it. */
    nav?.toggleAttribute("data-over-hero", rect.bottom > 64)
    if (!reducedMotion) {
      const fade = Math.min(1, progress * 2.4)
      copy!.style.opacity = String(1 - fade)
      copy!.style.transform = `translateY(${(-fade * 48).toFixed(1)}px)`
    }
  }
  const onScroll = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(measure)
  }
  window.addEventListener("scroll", onScroll, { passive: true })
  measure()

  /*
    Building the scene blocks the main thread for over a second, which would
    stall the hero's entrance, so that part waits. The entrance eases out, and
    by this point its last element has all but landed.
  */
  const entrance = new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ENTRANCE_SETTLED_MS))

  const load = async () => {
    try {
      const { mountIsland } = await import("./island-scene")
      scene = await mountIsland(stage, { logoUrl: "/logo.svg", reducedMotion, after: entrance })
      scene.setProgress(progress)
      stage.dataset.ready = ""

      new IntersectionObserver(([entry]) => {
        scene?.setActive(Boolean(entry?.isIntersecting))
      }).observe(hero)
    } catch (error) {
      console.warn("Hero scene unavailable", error)
    }
  }

  void load()
}

/* ---------------------------------------------------------------- nav ---- */

function initNav() {
  /* The link for the section in view is marked as current (skill B9). */
  const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]")]
  const sections = links
    .map((link) => document.querySelector<HTMLElement>(link.hash))
    .filter((section): section is HTMLElement => section !== null)

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        for (const link of links) {
          link.setAttribute("aria-current", String(link.hash === `#${entry.target.id}`))
        }
      }
    },
    { rootMargin: "-45% 0px -50% 0px" }
  )
  for (const section of sections) observer.observe(section)
}

/* ------------------------------------------------------------ reveals ---- */

/* Sections rise and fade in once as they enter, never replaying (B7). */
function initReveals() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add("is-revealed")
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: "0px 0px -12% 0px" }
  )
  for (const element of document.querySelectorAll("[data-reveal]")) observer.observe(element)
}

/*
  The tagline section (B11): each word moves from a muted tone to full colour
  as it crosses a line two thirds down the viewport, in reading order. Words
  are measured once per frame, not on every scroll event.
*/
function initTagline() {
  const words = [...document.querySelectorAll<HTMLElement>("[data-word]")]
  if (words.length === 0) return
  if (reducedMotion) {
    for (const word of words) word.dataset.lit = ""
    return
  }

  let queued = false
  function update() {
    queued = false
    const line = window.innerHeight * 0.66
    for (const word of words) {
      const { top } = word.getBoundingClientRect()
      word.toggleAttribute("data-lit", top < line)
    }
  }
  window.addEventListener(
    "scroll",
    () => {
      if (queued) return
      queued = true
      requestAnimationFrame(update)
    },
    { passive: true }
  )
  update()
}

initHero()
initNav()
initReveals()
initTagline()
