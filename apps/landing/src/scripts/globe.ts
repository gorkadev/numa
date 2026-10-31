/**
 * Starts the features section's globe (see `components/cobe-globe.tsx`).
 *
 * The settings are the @efferd/features-6 block's own, with two changes: the
 * globe follows the page's theme instead of always being dark, and it carries
 * no markers, since pinned cities would suggest players numa cannot point to.
 * cobe is loaded when the canvas nears the viewport, and the globe only spins
 * while it is on screen.
 */
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
const dark = window.matchMedia("(prefers-color-scheme: dark)").matches

for (const canvas of document.querySelectorAll<HTMLCanvasElement>("[data-cobe-globe]")) {
  let started = false

  const observer = new IntersectionObserver(
    async ([entry]) => {
      if (!entry?.isIntersecting || started) return
      started = true
      observer.disconnect()

      const { default: createGlobe } = await import("cobe")
      const side = canvas.offsetWidth
      if (side === 0) return

      const globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: side,
        height: side,
        phi: 0,
        theta: 0,
        dark: dark ? 1 : 0,
        diffuse: 1.2,
        mapSamples: 16_000,
        mapBrightness: dark ? 6 : 2,
        baseColor: dark ? [0.3, 0.3, 0.3] : [1, 1, 1],
        markerColor: [0.1, 0.8, 1],
        glowColor: dark ? [1, 1, 1] : [0.9, 0.92, 1],
        markers: [],
      })

      let phi = 0
      let frame = 0
      const loop = () => {
        globe.update({ phi })
        phi += 0.008
        frame = requestAnimationFrame(loop)
      }

      if (reducedMotion) {
        globe.update({ phi })
        return
      }

      new IntersectionObserver(([visible]) => {
        cancelAnimationFrame(frame)
        if (visible?.isIntersecting) loop()
      }).observe(canvas)
    },
    { rootMargin: "200px" }
  )
  observer.observe(canvas)
}

export {}
