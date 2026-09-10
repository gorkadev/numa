"use client"

import * as React from "react"
import { cn } from "cn"

/** How fast the text travels, in pixels per second. */
const SPEED = 45

/**
 * How long the text rests at each end of a leg, in seconds.
 *
 * The visible pause is *twice* this: `alternate` makes the tail of one leg and
 * the head of the next meet at the same extremity, so 1s here reads as a 2s
 * stop before the text turns around.
 */
const HOLD = 1

/** How wide the edge fades are. */
const FADE = "1.25rem"

/**
 * When the marquee runs.
 *
 * Two triggers, because the text is usually the smallest part of the thing a
 * person is pointing at: hovering the text itself, and hovering any ancestor
 * marked `data-marquee-group` — which is how a row hands its whole hit area to
 * the title sitting inside it.
 *
 * Spelled out in full rather than built from a shared piece: Tailwind reads
 * these out of the source as plain text, so a class name that only exists once
 * the code runs is a class name it never generates.
 */
const RUN_TEXT =
  "group-hover/marquee:animate-marquee [[data-marquee-group]:hover_&]:animate-marquee"
const RUN_FADE =
  "group-hover/marquee:animate-marquee-fade [[data-marquee-group]:hover_&]:animate-marquee-fade"

/**
 * Text that scrolls itself into view on hover when it does not fit.
 *
 * This is a *marquee* — the same thing Spotify does with a long track title and
 * ChatGPT with a long conversation name. The variant here is the one that reads
 * best for a list: hold, travel to the end, hold, and come back, so the text
 * always settles where the eye expects it. (The other common variant is the
 * seamless ticker, which duplicates the content and loops in one direction —
 * right for a news crawl, wrong for a title, since it never comes to rest.)
 *
 * When the text fits, none of this exists: no animation, no fade, no inline
 * style. Overflow is measured rather than assumed, because the same title fits
 * or does not depending on the sidebar's width and the font that loaded.
 */
function MarqueeText({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  const viewport = React.useRef<HTMLDivElement>(null)
  const content = React.useRef<HTMLSpanElement>(null)

  /** How far the content has to travel, in px. Zero means it fits. */
  const [shift, setShift] = React.useState(0)

  React.useEffect(() => {
    const viewportEl = viewport.current
    const contentEl = content.current
    if (!viewportEl || !contentEl) {
      return
    }

    function measure() {
      /**
       * `scrollWidth` of the content rather than of the viewport: the content
       * is `w-max`, so its own box is the full untruncated width, and the
       * transform the animation applies does not disturb either measurement.
       */
      setShift(
        Math.max(0, Math.round(contentEl!.scrollWidth - viewportEl!.clientWidth))
      )
    }

    measure()

    /**
     * Both boxes are observed: the viewport changes when the sidebar collapses
     * or the window resizes, the content when the title is renamed or a webfont
     * swaps in and re-measures the same string wider.
     */
    const observer = new ResizeObserver(measure)
    observer.observe(viewportEl)
    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [children])

  const overflows = shift > 0

  /**
   * The pauses are a *duration*, not a share of the animation — a long title
   * and a short one should both stop for the same second, even though the long
   * one spends far longer travelling. Since CSS keyframe offsets are fixed at
   * author time, the shape lives in the easing instead: a `linear()` with a
   * flat head and a flat tail holds the value still for exactly as long as
   * those flats last, and their size is whatever fraction of *this* element's
   * duration one HOLD works out to be.
   */
  const leg = HOLD + shift / SPEED + HOLD
  const flat = Math.round((HOLD / leg) * 1000) / 10

  return (
    <div
      ref={viewport}
      data-slot="marquee-text"
      data-overflow={overflows || undefined}
      className={cn(
        "group/marquee relative min-w-0 flex-1 overflow-hidden",
        /**
         * A soft edge instead of an ellipsis, on whichever side has text hidden
         * behind it. At rest that is only the end; the fade animation below
         * hands the fade over to the other side as the text travels.
         *
         * This is the same shape `scroll-fade-x` draws, but not that utility:
         * it is driven by `animation-timeline: scroll(self inline)`, so it
         * reads a real scroll position. Nothing scrolls here — the box is
         * `overflow-hidden` and the movement is a transform on the child — so
         * its progress would sit at 0 forever and no fade would ever appear.
         */
        overflows &&
          "[mask-image:linear-gradient(to_right,transparent_0,#000_var(--marquee-fade-s),#000_calc(100%-var(--marquee-fade-e)),transparent_100%)]",
        overflows && RUN_FADE,
        "motion-reduce:animate-none!",
        className
      )}
      style={
        overflows
          ? ({
              "--marquee-shift": `-${shift}px`,
              "--marquee-duration": `${leg}s`,
              "--marquee-ease": `linear(0 0% ${flat}%, 1 ${100 - flat}% 100%)`,
              "--marquee-fade-size": FADE,
              /**
               * The resting fades, which are also the animation's own `from`
               * values — so starting and stopping never makes an edge jump.
               */
              "--marquee-fade-s": "0px",
              "--marquee-fade-e": FADE,
            } as React.CSSProperties)
          : undefined
      }
      {...props}
    >
      <span
        ref={content}
        className={cn(
          "block w-max",
          overflows && RUN_TEXT,
          "motion-reduce:animate-none!"
        )}
      >
        {children}
      </span>
    </div>
  )
}

export { MarqueeText }
