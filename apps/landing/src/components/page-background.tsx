import { useEffect, useState } from "react"

import DotGrid from "./dot-grid"

const DARK_SCHEME = "(prefers-color-scheme: dark)"

/**
 * A dim grid of dots fixed behind the whole page in the dark theme, from
 * React Bits' DotGrid (WebGL2). The hero's opaque sky covers it, so it only
 * shows from the tagline down. The dots rest barely above black and light up
 * in `--primary` (#1447e6) only where the pointer pushes them. Without WebGL2
 * nothing is drawn, which is the plain page as before.
 */
export function PageBackground() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(DARK_SCHEME)
    const sync = () => setDark(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  if (!dark) return null

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
      <DotGrid
        baseColor="#141414"
        activeColor="#1447e6"
        dotSize={3}
        gap={20}
        proximity={120}
        strength={0.6}
        shockStrength={3}
        glow={0.3}
        swell={0.6}
        intro={false}
      />
    </div>
  )
}
