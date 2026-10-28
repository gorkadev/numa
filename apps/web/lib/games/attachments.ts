/**
 * Files a player attaches to a message, as context for the model only — they
 * never enter the game. The bytes live in the private uploads bucket under the
 * uploader's id, and a message holds nothing but a reference to them, so a
 * long thread weighs the same with attachments as without.
 */

/** Per file. The proxy refuses request bodies over 10 MB, so this stays under it. */
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024

/** Per message. */
export const ATTACHMENT_MAX_COUNT = 5

/**
 * What the model can read. Images and PDFs go to it as files; the text types
 * go as text. Anything a browser would render as a page (HTML, SVG) is left out
 * on purpose: these bytes are served back from our own origin.
 */
const TYPES_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
}

const TYPES = new Set(Object.values(TYPES_BY_EXTENSION))

/** The file input's `accept`: the types, plus extensions browsers report no type for. */
export const ATTACHMENT_ACCEPT = [
  ...TYPES,
  ...Object.keys(TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
].join(",")

/**
 * The file's type, or `null` when it is not one we take. Browsers leave the
 * type empty for extensions the OS has no association for (`.md` on most
 * systems), so the extension is the fallback, never an override.
 */
export function attachmentMediaType(file: { type: string; name: string }): string | null {
  if (TYPES.has(file.type)) return file.type
  if (file.type) return null
  const extension = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
  return TYPES_BY_EXTENSION[extension] ?? null
}

export type AttachmentProblem = "type" | "size" | "empty"

export function attachmentProblem(file: { type: string; name: string; size: number }): AttachmentProblem | null {
  if (!attachmentMediaType(file)) return "type"
  if (file.size === 0) return "empty"
  if (file.size > ATTACHMENT_MAX_BYTES) return "size"
  return null
}

export function isImageType(mediaType: string): boolean {
  return mediaType.startsWith("image/")
}

/** Text the model reads inline rather than as a file. */
export function isTextType(mediaType: string): boolean {
  return mediaType.startsWith("text/") || mediaType === "application/json"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAttachmentId(id: string): boolean {
  return UUID.test(id)
}

/**
 * The object key. The owner is part of it, so whoever resolves an id — the
 * read route from the session, the agent from the game row — can only ever
 * reach that user's files, whatever id a message claims.
 */
export function attachmentKey(userId: string, id: string): string {
  return `users/${userId}/${id}`
}

/**
 * The URL a message's file part carries. A scheme of its own rather than the
 * read route's path: the AI SDK parses it with `new URL`, which rejects a
 * relative one, and the agent has to tell our files apart from any URL a
 * crafted message could carry.
 */
export function attachmentUrl(id: string): string {
  return `attachment:${id}`
}

/** The id behind an attachment URL, or `null` for any other URL. */
export function attachmentIdFromUrl(url: string): string | null {
  const prefix = "attachment:"
  if (!url.startsWith(prefix)) return null
  const id = url.slice(prefix.length)
  return isAttachmentId(id) ? id : null
}

/** Where the browser reads an attachment: the owner-scoped read route. */
export function attachmentSrc(url: string): string | null {
  const id = attachmentIdFromUrl(url)
  return id ? `/api/attachments/${id}` : null
}
