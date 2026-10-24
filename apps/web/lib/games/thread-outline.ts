import type { UIMessage } from "ai"

/** A thread row as the outline reads it: the shape `chat-thread.tsx` renders. */
export type OutlineRun = {
  id: string
  role: "user" | "assistant"
  messages: UIMessage[]
}

export type OutlineTurn = {
  id: string
  text: string
  /** The final reply to this turn, as markdown; null until the agent has said something after its last tool call. */
  assistantText: string | null
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim()
}

/** The text the agent wrote after its last tool call, which is the answer rather than the narration. */
function finalText(message: UIMessage): string | null {
  const trailing: string[] = []
  for (const part of [...message.parts].reverse()) {
    if (part.type === "text") trailing.unshift(part.text)
    else if (
      part.type === "reasoning" ||
      part.type === "step-start" ||
      part.type.startsWith("data-")
    )
      continue
    else break
  }
  return trailing.join("\n\n").trim() || null
}

/** One entry per player message, in thread order, labelled by what they wrote. */
export function outlineTurns(runs: OutlineRun[]): OutlineTurn[] {
  return runs.flatMap((run, index) => {
    if (run.role !== "user") return []
    const next = runs[index + 1]
    const last = next?.role === "assistant" ? next.messages.at(-1) : undefined
    return [
      {
        id: run.id,
        text: run.messages.map(textOf).join(" ").trim(),
        assistantText: last ? finalText(last) : null,
      },
    ]
  })
}

const ITEM_SPACING = 8
const MAX_HEIGHT_CSS = "calc(100vh - 18rem)"
const PERSISTENT_GUTTER = 48
const HIT_STRIP_LEFT = 12
const HIT_STRIP_MAX_WIDTH = 40
const EXPANDED_HIT_STRIP_WIDTH = "22rem"
const PREVIEW_SOURCE_LIMIT = 1500

export const OUTLINE_MIN_TURNS = 2

export function outlineHeightStyle(count: number): string {
  return `min(${Math.max(1, (count - 1) * ITEM_SPACING)}px, ${MAX_HEIGHT_CSS})`
}

export function outlineTopPercent(index: number, count: number): number {
  if (count <= 1) return 0
  return (Math.max(0, Math.min(index, count - 1)) / (count - 1)) * 100
}

export function outlineIndexFromPointer(input: {
  itemCount: number
  railTop: number
  railHeight: number
  pointerY: number
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) return null
  if (input.itemCount === 1) return 0
  const progress = Math.max(
    0,
    Math.min(1, (input.pointerY - input.railTop) / input.railHeight)
  )
  return Math.round(progress * (input.itemCount - 1))
}

function sideGutter(viewportWidth: number, contentWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0
  if (!Number.isFinite(contentWidth)) return 0
  return Math.max(0, (viewportWidth - Math.min(viewportWidth, contentWidth)) / 2)
}

export function outlineHasPersistentGutter(
  viewportWidth: number,
  contentWidth: number
): boolean {
  return sideGutter(viewportWidth, contentWidth) >= PERSISTENT_GUTTER
}

export function outlineHitStripWidth(
  viewportWidth: number,
  contentWidth: number
): number {
  const gutter = Math.floor(sideGutter(viewportWidth, contentWidth))
  return Math.max(0, Math.min(HIT_STRIP_MAX_WIDTH, gutter - HIT_STRIP_LEFT))
}

export function outlineInteractiveWidth(
  width: number,
  expanded: boolean
): number | string {
  return expanded ? EXPANDED_HIT_STRIP_WIDTH : width
}

/** A reply as plain text for the preview card, bounded so a long stream stays cheap to read. */
export function previewText(markdown: string | null | undefined): string | null {
  if (!markdown) return null
  const plain = markdown
    .slice(0, PREVIEW_SOURCE_LIMIT)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/^\s*(?:```|~~~).*$/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/^\s*\|[\s:|-]+\|\s*$/gm, " ")
    .replace(/^\s*\|(.*)\|\s*$/gm, (_, row: string) => row.replace(/\|/g, " "))
    .replace(/\*\*|~~/g, "")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return plain || null
}

/**
 * The turn the reader is on: the one the topmost row on screen belongs to — a
 * player message is its own turn, a reply belongs to the message before it.
 *
 * The scroller can report this itself (`currentAnchorId`), but only for rows
 * marked as scroll anchors, and the thread cannot mark its history that way
 * yet: mount-time anchors trigger shadcn-ui/ui#11128, which jumps the view to
 * the oldest of them on every streamed chunk. The topmost visible row gives the
 * same answer without anchors, because the scroller counts a row as visible
 * against the same line `currentAnchorId` is measured from (the viewport top
 * plus the previous-item peek).
 */
export function currentTurnId(
  runs: OutlineRun[],
  visibleIds: readonly string[]
): string | null {
  const visible = new Set(visibleIds)
  const topmost = runs.findIndex((run) => visible.has(run.id))
  if (topmost === -1) return null

  const owner = runs
    .slice(0, topmost + 1)
    .reverse()
    .find((run) => run.role === "user")
  return owner?.id ?? null
}
