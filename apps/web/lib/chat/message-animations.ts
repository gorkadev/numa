import type { Variants } from "motion/react"

/**
 * How a message the player sends enters the thread. The presets are shadcn's
 * (`apps/v4/lib/message-animations.ts`, the message scroller's "Animating New
 * Messages" example), copied as they are so the motion matches the reference;
 * `none` is ours, for a player who would rather the message simply appear.
 */
const PRESETS = [
  {
    id: "fade",
    variants: {
      initial: { opacity: 0 },
      animate: {
        opacity: 1,
        transition: { duration: 0.22, ease: "easeOut" },
      },
      exit: { opacity: 0, transition: { duration: 0.15 } },
    },
  },
  {
    id: "slide-up",
    variants: {
      initial: { opacity: 0, y: 10 },
      animate: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
      },
      exit: { opacity: 0, y: 4, transition: { duration: 0.15 } },
    },
  },
  {
    id: "slide-side",
    variants: {
      initial: { opacity: 0, x: 18 },
      animate: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
      },
      exit: { opacity: 0, x: 8, transition: { duration: 0.15 } },
    },
  },
  {
    id: "pop",
    variants: {
      initial: { opacity: 0, scale: 0.94, y: 6, originX: 1, originY: 1 },
      animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 500, damping: 34, mass: 0.7 },
      },
      exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
    },
  },
  {
    id: "spring-bounce",
    variants: {
      initial: { opacity: 0, y: 12, scale: 0.96 },
      animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 520, damping: 30, mass: 0.7 },
      },
      exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
    },
  },
  {
    id: "blur-fade",
    variants: {
      initial: { opacity: 0, filter: "blur(4px)", y: 6 },
      animate: {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transition: { duration: 0.28, ease: "easeOut" },
      },
      exit: { opacity: 0, filter: "blur(2px)", transition: { duration: 0.15 } },
    },
  },
  {
    id: "scale-fade",
    variants: {
      initial: { opacity: 0, scale: 0.98 },
      animate: {
        opacity: 1,
        scale: 1,
        transition: { duration: 0.24, ease: "easeOut" },
      },
      exit: { opacity: 0, scale: 0.99, transition: { duration: 0.12 } },
    },
  },
] as const satisfies { id: string; variants: Variants }[]

export type MessageAnimationPresetId = (typeof PRESETS)[number]["id"]
export type MessageAnimationId = "none" | MessageAnimationPresetId

/** Every choice in the order the settings select lists them, `none` first. */
export const MESSAGE_ANIMATION_IDS = [
  "none",
  ...PRESETS.map((preset) => preset.id),
] as [MessageAnimationId, ...MessageAnimationId[]]

/** shadcn's own default in its example. */
export const DEFAULT_MESSAGE_ANIMATION: MessageAnimationId = "slide-up"

export function isMessageAnimationId(value: unknown): value is MessageAnimationId {
  return MESSAGE_ANIMATION_IDS.includes(value as MessageAnimationId)
}

/** The motion variants for a choice, or `undefined` for `none`. */
export function messageAnimationVariants(id: MessageAnimationId): Variants | undefined {
  return PRESETS.find((preset) => preset.id === id)?.variants
}
