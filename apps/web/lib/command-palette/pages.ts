/** The palette's nested pages; the root list is the empty stack. */
export type PalettePage = "theme" | "language" | "templates"

/**
 * The stack after a Backspace, or `null` when the key should only edit the
 * search: it goes back a page only once there is no text left to delete, the
 * way Raycast and the cmdk examples do, so a reader correcting a typo never
 * loses the page they are on.
 */
export function backFrom(
  pages: readonly PalettePage[],
  search: string
): PalettePage[] | null {
  if (search !== "" || pages.length === 0) return null
  return pages.slice(0, -1)
}
