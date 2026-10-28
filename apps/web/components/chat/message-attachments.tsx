"use client"

import type { FileUIPart } from "ai"
import { File01Icon, Pdf01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@workspace/ui/components/attachment"

import { attachmentSrc, isImageType } from "@/lib/games/attachments"

/**
 * The files a player sent with a message. The thread renders as soon as its
 * text does: each chip is only a name and an icon, and an image's thumbnail is
 * fetched lazily, when it scrolls into view, from the owner-scoped read route.
 */
export function MessageAttachments({ parts }: { parts: FileUIPart[] }) {
  const files = parts.flatMap((part) => {
    const src = attachmentSrc(part.url)
    return src ? [{ part, src }] : []
  })

  if (files.length === 0) return null

  return (
    <AttachmentGroup className="max-w-full self-end">
      {files.map(({ part, src }) => (
        <Attachment key={part.url} size="sm">
          <AttachmentMedia variant={isImageType(part.mediaType) ? "image" : "icon"}>
            {isImageType(part.mediaType) ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-scoped route, not an optimizable asset
              <img src={src} alt="" loading="lazy" decoding="async" />
            ) : (
              <HugeiconsIcon icon={part.mediaType === "application/pdf" ? Pdf01Icon : File01Icon} />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{part.filename ?? part.mediaType}</AttachmentTitle>
          </AttachmentContent>
          <AttachmentTrigger
            render={<a href={src} target="_blank" rel="noopener noreferrer" />}
            aria-label={part.filename ?? part.mediaType}
          />
        </Attachment>
      ))}
    </AttachmentGroup>
  )
}
