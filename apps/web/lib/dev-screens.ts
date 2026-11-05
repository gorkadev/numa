/**
 * The whole-page states the dev screen gallery (`/dev/screens`) shows: every
 * error, not-found and loading screen, each rendered the way a reader meets
 * it. Development only; both gallery routes 404 in production.
 */
export const DEV_SCREENS = [
  {
    id: "not-found",
    group: "Errors",
    title: "Not found",
    note: "notFound() from a page: a game that is not yours, or was deleted.",
  },
  {
    id: "unknown-url",
    group: "Errors",
    title: "Unknown URL",
    note: "Any path no route matches, through [...rest]/page.tsx.",
    src: "/this-page-does-not-exist",
  },
  {
    id: "error",
    group: "Errors",
    title: "Page error",
    note: "A page that throws, caught by [locale]/error.tsx. In dev the overlay badge shows too.",
  },
  {
    id: "global-error",
    group: "Errors",
    title: "Root layout error",
    note: "app/global-error.tsx, which replaces the whole document when the root layout fails.",
  },
  {
    id: "game-load-error",
    group: "Errors",
    title: "Game failed to load",
    note: "GameRoute when the game's row cannot be read; retry refetches it.",
  },
  {
    id: "loading-home",
    group: "Loading",
    title: "Home",
    note: "(app)/loading.tsx",
  },
  {
    id: "loading-game",
    group: "Loading",
    title: "Game",
    note: "ChatSkeleton from GameRoute. games/[id]/loading.tsx is empty on purpose.",
  },
  {
    id: "loading-library",
    group: "Loading",
    title: "Library",
    note: "(app)/library/loading.tsx",
  },
  {
    id: "loading-pricing",
    group: "Loading",
    title: "Pricing",
    note: "(app)/pricing/loading.tsx",
  },
  {
    id: "loading-profile",
    group: "Loading",
    title: "Profile",
    note: "(app)/profile/loading.tsx",
  },
  {
    id: "loading-play",
    group: "Loading",
    title: "Play",
    note: "games/[id]/play/loading.tsx, full screen outside the app shell.",
  },
] as const satisfies readonly {
  id: string
  group: string
  title: string
  note: string
  src?: string
}[]

export type DevScreenId = (typeof DEV_SCREENS)[number]["id"]

export function devScreenSrc(screen: (typeof DEV_SCREENS)[number]): string {
  return "src" in screen ? screen.src : `/dev/screen/${screen.id}`
}

export const devScreensEnabled = process.env.NODE_ENV === "development"
