import type { ModelMessage, UIMessage } from "ai"

import {
  ATTACHMENT_MAX_COUNT,
  attachmentIdFromUrl,
  attachmentKey,
  attachmentMediaType,
  isTextType,
} from "@/lib/games/attachments"

/**
 * A user message's file parts, reduced to the ones the composer can produce:
 * references to our own attachments, of a type we take, at most five.
 *
 * Messages arrive from the browser and are persisted as they come, so anything
 * else is dropped before it is stored — a `data:` URL would put the bytes in
 * the thread, and any other URL would have the worker fetch whatever it names.
 */
export function keepAttachmentParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || !message.parts.some((part) => part.type === "file")) {
      return message
    }

    let files = 0
    const parts = message.parts.flatMap((part): UIMessage["parts"] => {
      if (part.type !== "file") return [part]
      const ours =
        attachmentIdFromUrl(part.url) !== null &&
        attachmentMediaType({ type: part.mediaType, name: part.filename ?? "" }) === part.mediaType
      if (!ours || files >= ATTACHMENT_MAX_COUNT) return []
      files += 1
      /** Rebuilt from the fields we use, so nothing else the client sent is stored. */
      return [{ type: "file", mediaType: part.mediaType, url: part.url, ...(part.filename ? { filename: part.filename } : {}) }]
    })

    return { ...message, parts }
  })
}

export type ReadAttachment = (key: string) => Promise<Uint8Array | null>

/**
 * Text read inline, per file: about 50k tokens. A text file is the cheapest
 * way to blow the context window — 8 MB of CSV is a couple of million tokens —
 * so it is cut, and the model is told it was.
 */
export const TEXT_ATTACHMENT_MAX_CHARS = 200_000

/**
 * What one turn sends in attachments, in bytes. The whole thread goes to the
 * model every turn, so without a ceiling one heavy thread would fail every turn
 * from then on. The newest files are kept; older ones become a note.
 */
export const ATTACHMENT_TURN_BUDGET_BYTES = 16 * 1024 * 1024

/**
 * What one turn sends in inline text, in characters: two whole text files.
 * Text is priced by its own budget because bytes say nothing about tokens —
 * 16 MB of CSV is around 4M tokens, CJK text closer to one token a character —
 * and this keeps the worst case (~400k tokens) well inside the context window.
 */
export const TEXT_ATTACHMENT_TURN_BUDGET_CHARS = 2 * TEXT_ATTACHMENT_MAX_CHARS

type UserContent = Exclude<Extract<ModelMessage, { role: "user" }>["content"], string>
type UserPart = UserContent[number]
type FilePart = Extract<UserPart, { type: "file" }>

/**
 * The model's messages with each attachment replaced by what it holds: bytes
 * for images and PDFs, the text itself for text files.
 *
 * The key is built from `userId`, the game's owner, so a message can only ever
 * reach that user's own files; with no owner, nothing is read. A file that is
 * gone, a URL that is not one of ours, or a file past the turn's budget
 * becomes a note instead of failing the turn. Files are resolved newest first,
 * so the budget goes to what the player attached last.
 */
export async function resolveAttachments(
  messages: ModelMessage[],
  userId: string | null,
  read: ReadAttachment
): Promise<ModelMessage[]> {
  const budget = { bytes: ATTACHMENT_TURN_BUDGET_BYTES, chars: TEXT_ATTACHMENT_TURN_BUDGET_CHARS }
  const resolved = [...messages]

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!
    if (message.role !== "user" || typeof message.content === "string") continue
    if (!message.content.some((part) => part.type === "file")) continue

    const content: UserPart[] = []
    for (const part of message.content) {
      if (part.type !== "file") {
        content.push(part)
        continue
      }
      content.push(await resolvePart(part, userId, read, budget))
    }
    resolved[index] = { ...message, content }
  }

  return resolved
}

async function resolvePart(
  part: FilePart,
  userId: string | null,
  read: ReadAttachment,
  /** What is left of this turn's budgets; spent here as files are kept. */
  budget: { bytes: number; chars: number }
): Promise<UserPart> {
  const name = part.filename ?? "file"
  const gone: UserPart = { type: "text", text: `[Attached file ${name} is no longer available]` }
  const omitted: UserPart = { type: "text", text: `[Attached file ${name} left out to save context]` }
  const url = fileUrl(part.data)
  const id = url ? attachmentIdFromUrl(url) : null
  if (!id || !userId) return gone

  const text = isTextType(part.mediaType)
  if ((text ? budget.chars : budget.bytes) <= 0) return omitted

  const bytes = await read(attachmentKey(userId, id))
  if (!bytes) return gone

  if (text) {
    const full = new TextDecoder().decode(bytes)
    const kept = full.slice(0, TEXT_ATTACHMENT_MAX_CHARS)
    if (kept.length > budget.chars) return omitted
    budget.chars -= kept.length
    const cut = full.length > kept.length ? `\n\n[Truncated: the file is longer than ${TEXT_ATTACHMENT_MAX_CHARS} characters]` : ""
    return { type: "text", text: `Attached file ${name}:\n\n${kept}${cut}` }
  }

  if (bytes.byteLength > budget.bytes) return omitted
  budget.bytes -= bytes.byteLength
  return { type: "file", mediaType: part.mediaType, filename: part.filename, data: { type: "data", data: bytes } }
}

function fileUrl(data: FilePart["data"]): string | null {
  if (data instanceof URL) return data.href
  if (typeof data === "object" && data !== null && "type" in data && data.type === "url") return data.url.href
  return null
}
