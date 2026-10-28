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
    const parts = message.parts.filter((part) => {
      if (part.type !== "file") return true
      const ours =
        attachmentIdFromUrl(part.url) !== null &&
        attachmentMediaType({ type: part.mediaType, name: part.filename ?? "" }) === part.mediaType
      if (!ours || files >= ATTACHMENT_MAX_COUNT) return false
      files += 1
      return true
    })

    return { ...message, parts }
  })
}

export type ReadAttachment = (key: string) => Promise<Uint8Array | null>

type UserContent = Exclude<Extract<ModelMessage, { role: "user" }>["content"], string>
type UserPart = UserContent[number]

/**
 * The model's messages with each attachment replaced by what it holds: bytes
 * for images and PDFs, the text itself for text files.
 *
 * The key is built from `userId`, the game's owner, so a message can only ever
 * reach that user's own files. A file that is gone, or a URL that is not one
 * of ours, becomes a note instead of failing the turn.
 */
export async function resolveAttachments(
  messages: ModelMessage[],
  userId: string,
  read: ReadAttachment
): Promise<ModelMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user" || typeof message.content === "string") return message
      if (!message.content.some((part) => part.type === "file")) return message

      const content = await Promise.all(
        message.content.map((part) => (part.type === "file" ? resolvePart(part, userId, read) : part))
      )
      return { ...message, content }
    })
  )
}

async function resolvePart(
  part: Extract<UserPart, { type: "file" }>,
  userId: string,
  read: ReadAttachment
): Promise<UserPart> {
  const name = part.filename ?? "file"
  const gone: UserPart = { type: "text", text: `[Attached file ${name} is no longer available]` }
  const url = fileUrl(part.data)
  const id = url ? attachmentIdFromUrl(url) : null
  if (!id) return gone

  const bytes = await read(attachmentKey(userId, id))
  if (!bytes) return gone

  if (isTextType(part.mediaType)) {
    return { type: "text", text: `Attached file ${name}:\n\n${new TextDecoder().decode(bytes)}` }
  }

  return { type: "file", mediaType: part.mediaType, filename: part.filename, data: { type: "data", data: bytes } }
}

function fileUrl(data: Extract<UserPart, { type: "file" }>["data"]): string | null {
  if (data instanceof URL) return data.href
  if (typeof data === "object" && data !== null && "type" in data && data.type === "url") return data.url.href
  return null
}
