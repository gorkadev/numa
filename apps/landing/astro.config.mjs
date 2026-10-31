import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

/**
 * The marketing site is fully static. Every page is prerendered at build time
 * and ships plain HTML; the only scripts are the 3D hero and a few small
 * progressive enhancements. React is here only to render the shared
 * `@workspace/ui` primitives at build time: no component is hydrated, so none
 * of it reaches the browser. Spanish lives under `/es`, English is the
 * unprefixed default.
 */
export default defineConfig({
  site: "https://numa.example",
  output: "static",
  integrations: [react()],
  i18n: {
    locales: ["en", "es"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
