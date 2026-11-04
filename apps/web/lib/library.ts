import { isAttachmentId, isImageType } from "@/lib/games/attachments"

/**
 * One file in the library, as the page receives it. `createdAt` is a string
 * because the row crosses into a client component and over JSON, where a
 * `Date` would arrive serialized anyway.
 */
export type LibraryItem = {
  id: string
  filename: string
  mediaType: string
  size: number
  createdAt: string
}

/** One page of the library and the cursor of the next, `null` on the last. */
export type LibraryPage = {
  items: LibraryItem[]
  next: string | null
}

export type LibraryKind = "image" | "document"

export type LibraryTab = LibraryKind | "all"

/**
 * Rows per request. Divisible by the grid's two, three and four columns, so
 * every page but the last fills its rows.
 */
export const LIBRARY_PAGE_SIZE = 48

export function libraryKind(mediaType: string): LibraryKind {
  return isImageType(mediaType) ? "image" : "document"
}

export function parseLibraryTab(value: string | null): LibraryTab {
  return value === "image" || value === "document" ? value : "all"
}

type CursorRow = { createdAt: Date; id: string }

const CURSOR_SEPARATOR = "~"

/**
 * Where the next page starts: the last row's date and id. Pages are ordered
 * by both, newest first, so a file uploaded while the list is open never
 * shifts a later page the way an offset would.
 */
export function encodeLibraryCursor({ createdAt, id }: CursorRow): string {
  return `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`
}

/** `undefined` for the first page, `null` for a cursor that is not one. */
export function parseLibraryCursor(
  value: string | null
): CursorRow | undefined | null {
  if (!value) return undefined

  const [at, id, ...rest] = value.split(CURSOR_SEPARATOR)
  const createdAt = new Date(at ?? "")

  if (rest.length > 0 || !id || !isAttachmentId(id)) return null
  if (Number.isNaN(createdAt.getTime())) return null

  return { createdAt, id }
}

/**
 * A page from rows read one past the limit: the extra row only proves there
 * is more, and the last row kept is where the next page starts.
 */
export function libraryPage(
  rows: (Omit<LibraryItem, "createdAt"> & { createdAt: Date })[],
  limit: number
): LibraryPage {
  const kept = rows.slice(0, limit)
  const last = kept.at(-1)

  return {
    items: kept.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    next: rows.length > limit && last ? encodeLibraryCursor(last) : null,
  }
}
