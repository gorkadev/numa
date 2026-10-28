"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { FileUIPart } from "ai"

import {
  ATTACHMENT_MAX_COUNT,
  attachmentMediaType,
  attachmentProblem,
  isImageType,
  type AttachmentProblem,
} from "@/lib/games/attachments"

export type ComposerAttachment = {
  id: string
  name: string
  mediaType: string
  state: "uploading" | "done" | "error"
  /** Why it failed, when it did: a rule it broke, or the upload itself. */
  problem?: AttachmentProblem | "upload"
  /** A local preview for images, so the chip shows it before the upload ends. */
  preview?: string
  part?: FileUIPart
}

/**
 * The files attached to the message being written. Each one is uploaded the
 * moment it is picked, so by the time the player presses Enter there is
 * usually nothing left to wait for, and the message carries only references.
 */
export function useComposerAttachments() {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const previews = useRef(new Set<string>())

  /** Object URLs hold the file in memory until revoked. */
  useEffect(() => {
    const urls = previews.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  function update(id: string, change: Partial<ComposerAttachment>) {
    setAttachments((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }

  async function upload(id: string, file: File, mediaType: string) {
    const body = new FormData()
    /** Retyped, so a file the browser could not name a type for keeps the one we resolved. */
    body.set("file", file.type === mediaType ? file : new File([file], file.name, { type: mediaType }))

    try {
      const response = await fetch("/api/attachments", { method: "POST", body })
      if (!response.ok) throw new Error(String(response.status))
      const part = (await response.json()) as { url: string; mediaType: string; filename: string }
      update(id, { state: "done", part: { type: "file", ...part } })
    } catch {
      update(id, { state: "error", problem: "upload" })
    }
  }

  function add(files: FileList | File[]) {
    const room = ATTACHMENT_MAX_COUNT - attachments.length
    const picked = Array.from(files).slice(0, Math.max(0, room))

    const added = picked.map((file): ComposerAttachment => {
      const problem = attachmentProblem(file)
      const mediaType = attachmentMediaType(file) ?? file.type
      const preview = !problem && isImageType(mediaType) ? URL.createObjectURL(file) : undefined
      if (preview) previews.current.add(preview)

      return {
        id: crypto.randomUUID(),
        name: file.name,
        mediaType,
        state: problem ? "error" : "uploading",
        problem: problem ?? undefined,
        preview,
      }
    })

    setAttachments((current) => [...current, ...added])
    added.forEach((item, index) => {
      if (item.state === "uploading") void upload(item.id, picked[index]!, item.mediaType)
    })
  }

  function forget(item: ComposerAttachment) {
    if (item.preview) {
      URL.revokeObjectURL(item.preview)
      previews.current.delete(item.preview)
    }
  }

  function remove(id: string) {
    setAttachments((current) => {
      const item = current.find((entry) => entry.id === id)
      if (item) forget(item)
      return current.filter((entry) => entry.id !== id)
    })
  }

  const clear = useCallback(() => {
    setAttachments((current) => {
      current.forEach(forget)
      return []
    })
  }, [])

  return {
    attachments,
    add,
    remove,
    clear,
    full: attachments.length >= ATTACHMENT_MAX_COUNT,
    uploading: attachments.some((item) => item.state === "uploading"),
    /** What a sent message carries: the uploaded files, never the failed ones. */
    parts: attachments.flatMap((item) => (item.state === "done" && item.part ? [item.part] : [])),
  }
}
