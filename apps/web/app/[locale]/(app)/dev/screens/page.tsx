import Link from "next/link"
import { notFound } from "next/navigation"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import {
  DEV_SCREENS,
  devScreenSrc,
  devScreensEnabled,
} from "@/lib/dev-screens"

/** A desktop viewport, shrunk to fit a card. */
const FRAME = { width: 1280, height: 800, scale: 0.3 }

/**
 * Development-only gallery of every whole-page state: errors, the 404 and
 * each route's loading screen, live in frames so they render with the real
 * boundaries, theme and locale. Open one to see it full size.
 */
export default function DevScreens() {
  if (!devScreensEnabled) notFound()

  const groups = [...new Set(DEV_SCREENS.map((screen) => screen.group))].map(
    (group) => ({
      group,
      screens: DEV_SCREENS.filter((screen) => screen.group === group),
    })
  )

  return (
    <main className="flex h-svh w-full min-w-0 flex-col overflow-y-auto">
      <header className="flex h-14 shrink-0 items-center gap-1 px-4">
        <MobileSidebarTrigger className="-ms-1.5" />
        <h1 className="text-base font-medium">Screens</h1>
        <span className="ms-2 text-sm text-muted-foreground">
          Development only
        </span>
      </header>
      <div className="flex flex-col gap-8 px-4 pb-10 md:px-8">
        {groups.map(({ group, screens }) => (
          <section key={group} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {group}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,384px)] gap-4">
              {screens.map((screen) => {
                const src = devScreenSrc(screen)
                return (
                  <article key={screen.id} className="flex flex-col gap-2">
                    <div
                      className="relative overflow-hidden rounded-lg border bg-background"
                      style={{
                        width: FRAME.width * FRAME.scale,
                        height: FRAME.height * FRAME.scale,
                      }}
                    >
                      <iframe
                        src={src}
                        title={screen.title}
                        loading="lazy"
                        tabIndex={-1}
                        className="pointer-events-none absolute top-0 left-0 origin-top-left"
                        style={{
                          width: FRAME.width,
                          height: FRAME.height,
                          transform: `scale(${FRAME.scale})`,
                        }}
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-medium">{screen.title}</h3>
                      <Link
                        href={src}
                        target="_blank"
                        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {screen.note}
                    </p>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
