"use client"

import { useEffect, useState } from "react"

import { TextWrapIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@workspace/ui/components/code-block"
import { useFormatter, useTranslations } from "next-intl"

import { Spinner } from "@/components/localized-spinner"
import { useDefaultCodeWrap } from "@/components/chat/code-wrap"
import { useHighlightedCode } from "@/hooks/use-highlighted-code"
import { fileContentUrl, fileViewOf, MAX_VIEW_BYTES, previewAssetUrl } from "@/lib/games/files"
import type { ReadGameFileResult } from "@/lib/games/files-server"
import { ModelViewer } from "./model-viewer"

export type ViewedFile = { name: string; path: string; size: number }

type FileViewerProps = {
  gameId: string
  previewToken: string
  /** The game version files are read at — see `fileContentUrl` for why it keys the cache. */
  version: number
  file: ViewedFile
}

/**
 * Shows one file of the game, read-only, in whatever form suits it.
 *
 * Text goes through the content endpoint and the same highlighter the chat's
 * code blocks use. Media is loaded straight from the preview proxy, which
 * already serves the game directory: an SVG is drawn through `<img>`, where
 * its scripts never run, rather than inlined into this page, and a glTF
 * model finds its `.bin` and textures next to it there.
 */
export function FileViewer({ gameId, previewToken, version, file }: FileViewerProps) {
  const view = fileViewOf(file.path)
  const src = previewAssetUrl(gameId, previewToken, file.path, version)

  switch (view.kind) {
    case "code":
      if (file.size > MAX_VIEW_BYTES) return <FileNotice file={file} messageKey="tooLarge" />
      return (
        <TextFile
          key={file.path}
          gameId={gameId}
          version={version}
          file={file}
          language={view.language}
        />
      )
    case "image":
      return (
        <MediaFrame>
          {/* eslint-disable-next-line @next/next/no-img-element -- a sandboxed game asset behind the preview proxy, not an optimizable app image */}
          <img
            src={src}
            alt={file.name}
            className="max-h-full max-w-full rounded-lg object-contain [image-rendering:pixelated]"
          />
        </MediaFrame>
      )
    case "audio":
      return (
        <MediaFrame>
          <audio controls src={src} className="w-full max-w-md" />
        </MediaFrame>
      )
    case "video":
      return (
        <MediaFrame>
          <video controls src={src} className="max-h-full max-w-full rounded-lg" />
        </MediaFrame>
      )
    case "model":
      return <ModelViewer key={src} src={src} name={file.name} />
    case "binary":
      return <FileNotice file={file} messageKey="binary" />
  }
}

function MediaFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4">
      {children}
    </div>
  )
}

type TextState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "done"; result: Extract<ReadGameFileResult, { ok: true }> | Extract<ReadGameFileResult, { reason: "too_large" | "binary" }> }

function TextFile({
  gameId,
  version,
  file,
  language,
}: {
  gameId: string
  version: number
  file: ViewedFile
  language: string
}) {
  const t = useTranslations("ChatFiles")
  const [state, setState] = useState<TextState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch(fileContentUrl(gameId, file.path, version), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        setState({ status: "done", result: await response.json() })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed" })
      })

    return () => controller.abort()
  }, [gameId, file.path, version, attempt])

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {t("loadingFile", { name: file.name })}
      </div>
    )
  }

  if (state.status === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        {t("loadFailed")}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setState({ status: "loading" })
            setAttempt((count) => count + 1)
          }}
        >
          {t("retry")}
        </Button>
      </div>
    )
  }

  const { result } = state
  if (!result.ok) {
    return (
      <FileNotice
        file={file}
        messageKey={result.reason === "too_large" ? "tooLarge" : "binary"}
      />
    )
  }

  return <FileCode path={result.path} language={language} content={result.content} />
}

/** The text of one file in a full-height `CodeBlock`, laid out like the chat's own fenced code. */
export function FileCode({
  path,
  language,
  content,
}: {
  path: string
  language: string
  content: string
}) {
  const t = useTranslations("ChatMessages")
  const [wrap, setWrap] = useState(useDefaultCodeWrap())
  const lines = useHighlightedCode(content, language)

  return (
    <CodeBlock className="h-full rounded-none bg-transparent ring-0 dark:ring-0">
      <CodeBlockHeader>
        <CodeBlockTitle className="font-mono text-xs text-muted-foreground">
          {path}
        </CodeBlockTitle>
        <CodeBlockActions>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("wrapLines")}
            aria-pressed={wrap}
            className="aria-pressed:text-foreground"
            onClick={() => setWrap((value) => !value)}
          >
            <HugeiconsIcon icon={TextWrapIcon} strokeWidth={2} />
          </Button>
          <CodeBlockCopyButton
            value={content}
            copyLabel={t("copyCode")}
            copiedLabel={t("copied")}
          />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent wrap={wrap} lineNumbers className="flex-1">
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}

function FileNotice({
  file,
  messageKey,
}: {
  file: ViewedFile
  messageKey: "binary" | "tooLarge"
}) {
  const t = useTranslations("ChatFiles")
  const format = useFormatter()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
      <p className="text-sm font-medium">{file.name}</p>
      <p className="text-sm text-muted-foreground">{t(messageKey)}</p>
      <p className="text-xs text-muted-foreground">{formatSize(format, file.size)}</p>
    </div>
  )
}

function formatSize(format: ReturnType<typeof useFormatter>, bytes: number): string {
  if (bytes < 1024) return format.number(bytes, { style: "unit", unit: "byte" })
  if (bytes < 1024 * 1024) {
    return format.number(bytes / 1024, { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 })
  }
  return format.number(bytes / (1024 * 1024), { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })
}
