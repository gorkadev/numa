import { useEffect, useState } from "react"

import ShapeWaves from "./shape-waves"

const DARK_SCHEME = "(prefers-color-scheme: dark)"

/**
 * A slow, dim field of shapes fixed behind the whole page in the dark theme.
 * The hero's opaque sky covers it, so it only shows from the tagline down.
 * Colors are hex because the shader reads hex: a gray barely above black for the
 * shapes, and `--primary` (#1447e6) only where the pointer stirs them.
 * Without WebGPU it paints the plain background, which is the page as before.
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
      <ShapeWaves
        color="#0d0d0d"
        hoverColor="#1447e6"
        backgroundColor="#000000"
        cellSize={14}
        brightness={0.25}
        speed={0.5}
        glow={0}
        fade={0.5}
        intro={false}
      />
    </div>
  )
}
