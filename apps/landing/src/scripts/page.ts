/**
 * Progressive enhancement for the landing page. Every piece checks for its
 * markup and does nothing when it is absent, and the page is complete without
 * any of it: links link, the composer submits, every section is visible.
 */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* --------------------------------------------------------------- hero ---- */

/*
  The island is fetched only after the page has painted: three.js and the
  models are the heaviest thing on the site, and nothing above the fold waits
  for them. A failure leaves the CSS sky, which is a complete hero on its own.
*/
function initHero() {
  const hero = document.querySelector<HTMLElement>("[data-hero]")
  const stage = hero?.querySelector<HTMLElement>("[data-island]")
  const copy = hero?.querySelector<HTMLElement>("[data-hero-copy]")
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
    progress = Math.min(1, Math.max(0, -rect.top / travel))
    scene?.setProgress(progress)
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

  const load = async () => {
    try {
      const { mountIsland } = await import("./island-scene")
      scene = await mountIsland(stage, { logoUrl: "/logo.svg", reducedMotion })
      scene.setProgress(progress)
      stage.dataset.ready = ""

      new IntersectionObserver(([entry]) => {
        scene?.setActive(Boolean(entry?.isIntersecting))
      }).observe(hero)
    } catch (error) {
      console.warn("Hero scene unavailable", error)
    }
  }

  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 1200 })
  else setTimeout(load, 200)
}

/* ----------------------------------------------------------- composer ---- */

function initComposers() {
  for (const form of document.querySelectorAll<HTMLFormElement>("[data-composer]")) {
    const field = form.querySelector<HTMLTextAreaElement>("textarea")
    const error = form.querySelector<HTMLElement>("[data-composer-error]")
    if (!field) continue

    /* The box grows with the prompt instead of scrolling inside itself. */
    const grow = () => {
      field.style.height = "auto"
      field.style.height = `${field.scrollHeight}px`
    }
    field.addEventListener("input", () => {
      grow()
      if (error && field.value.trim()) error.hidden = true
    })

    /* Enter sends, Shift+Enter breaks the line, as in the app. */
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        form.requestSubmit()
      }
    })

    form.addEventListener("submit", (event) => {
      if (field.value.trim()) return
      event.preventDefault()
      if (error) error.hidden = false
      field.focus()
    })

    for (const chip of form.querySelectorAll<HTMLButtonElement>("[data-suggestion]")) {
      chip.addEventListener("click", () => {
        field.value = chip.dataset.suggestion ?? ""
        grow()
        if (error) error.hidden = true
        field.focus()
        field.setSelectionRange(field.value.length, field.value.length)
      })
    }
  }
}

/* ---------------------------------------------------------------- nav ---- */

function initNav() {
  const toggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]")
  const menu = document.querySelector<HTMLElement>("[data-mobile-menu]")
  const label = toggle?.querySelector<HTMLElement>("[data-menu-label]")

  function setOpen(open: boolean) {
    if (!toggle || !menu) return
    toggle.setAttribute("aria-expanded", String(open))
    if (label) label.textContent = (open ? toggle.dataset.closeLabel : toggle.dataset.openLabel) ?? ""
    menu.toggleAttribute("data-open", open)
    menu.inert = !open
    document.body.style.overflow = open ? "hidden" : ""
  }

  toggle?.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"))
  for (const link of menu?.querySelectorAll("[data-menu-link]") ?? []) {
    link.addEventListener("click", () => setOpen(false))
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false)
  })

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
initComposers()
initNav()
initReveals()
initTagline()
