"use client"

import { mentionLabel, splitMentions } from "@/lib/games/mention-doc"

/**
 * What the player typed, with each file they mentioned shown as the chip the
 * composer showed — its name, the full path on hover — and opening that file
 * in the side panel when clicked. The rest stays verbatim text.
 *
 * The chip sits on the user bubble's primary fill, so it is drawn in that
 * bubble's foreground rather than the composer's primary-on-input colours.
 */
export function MentionText({
  text,
  onOpenFile,
}: {
  text: string
  onOpenFile?: (path: string) => void
}) {
  return splitMentions(text).map((segment, index) =>
    segment.kind === "text" ? (
      segment.text
    ) : (
      <button
        key={index}
        type="button"
        data-slot="mention-chip"
        title={segment.path}
        disabled={!onOpenFile}
        onClick={() => onOpenFile?.(segment.path)}
        className="inline rounded-md bg-primary-foreground/20 px-1 py-0.5 font-medium [box-decoration-break:clone] enabled:cursor-pointer enabled:hover:bg-primary-foreground/30"
      >
        {mentionLabel(segment.path)}
      </button>
    )
  )
}
