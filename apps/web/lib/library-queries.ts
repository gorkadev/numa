import { and, eq, like, notLike, sql } from "drizzle-orm"
import { db } from "@workspace/db"
import { attachments } from "@workspace/db/schema"

import {
  LIBRARY_PAGE_SIZE,
  libraryPage,
  type LibraryPage,
  type LibraryTab,
} from "@/lib/library"
import { containsPattern, foldedContains } from "@/lib/search-fold"
import { requireSession } from "@/lib/session"

export type LibraryPageQuery = {
  tab: LibraryTab
  query: string
  /** Where the page starts; omitted for the first. */
  after?: { createdAt: Date; id: string }
}

/**
 * One page of a user's uploaded files, newest first.
 *
 * Keyset pagination on `(created_at, id)`, matching
 * `attachments_user_id_created_at_idx`: every page costs the same however deep
 * the scroll, and a file uploaded meanwhile cannot shift a later page. One row
 * past the page size is read only to learn whether another page exists.
 */
export async function readLibraryPage(
  userId: string,
  { tab, query, after }: LibraryPageQuery
): Promise<LibraryPage> {
  const pattern = containsPattern(query)

  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      mediaType: attachments.mediaType,
      size: attachments.size,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        tab === "image" ? like(attachments.mediaType, "image/%") : undefined,
        tab === "document"
          ? notLike(attachments.mediaType, "image/%")
          : undefined,
        pattern ? foldedContains(attachments.filename, pattern) : undefined,
        after
          ? sql`(${attachments.createdAt}, ${attachments.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
          : undefined
      )
    )
    .orderBy(
      sql`${attachments.createdAt} desc nulls last`,
      sql`${attachments.id} desc nulls last`
    )
    .limit(LIBRARY_PAGE_SIZE + 1)

  return libraryPage(rows, LIBRARY_PAGE_SIZE)
}

/** The first page for the signed-in user, rendered with the page itself. */
export async function readFirstLibraryPage(): Promise<LibraryPage> {
  const { user } = await requireSession()
  return readLibraryPage(user.id, { tab: "all", query: "" })
}
