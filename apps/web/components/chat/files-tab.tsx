"use client"

import { useEffect, useMemo, useState } from "react"

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"

import { FileTree } from "@/components/chat/file-tree"
import { FileViewer } from "@/components/chat/file-viewer"
import { Spinner } from "@/components/localized-spinner"
import {
  fileContentUrl,
  findFile,
  isPrefetchableText,
  type FileTreeNode,
} from "@/lib/games/files"
import { createHoverPrefetcher } from "@/lib/games/hover-prefetch"

type TreeState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; tree: FileTreeNode[] }

/**
 * The game directory, fetched when the tab mounts and again whenever the
 * version moves — a turn that wrote files is exactly when the listing goes
 * stale, so there is nothing to poll for in between. The first fetch is also
 * what resumes an archived sandbox, so its loading state says so.
 *
 * A refetch keeps the current tree on screen instead of falling back to the
 * loading state: the tree only changes by a file or two per turn, and
 * blanking it would throw away the reader's place.
 */
function useFileTree(gameId: string, version: number) {
  const [state, setState] = useState<TreeState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/games/${gameId}/files`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const { tree } = (await response.json()) as { tree: FileTreeNode[] }
        setState({ status: "ready", tree })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((current) => (current.status === "ready" ? current : { status: "failed" }))
        }
      })

    return () => controller.abort()
  }, [gameId, version, attempt])

  function retry() {
    setState({ status: "loading" })
    setAttempt((count) => count + 1)
  }

  return { state, retry }
}

type FilesTabBodyProps = {
  gameId: string
  previewToken: string
  /** The game version: the last turn's file revision, or the last finished turn's time on a fresh page load. */
  version: number
  /** Owned by `SidePanel`, which stays mounted, so switching tabs and back reopens the same file. */
  selectedPath: string | null
  onSelectPath: (path: string | null) => void
}

/**
 * The Files tab: the game's directory on the left and the selected file on
 * the right, read-only. Laid out exactly like `AgentsTabBody` in
 * `side-panel.tsx` — two columns from the `@2xl:` container breakpoint up,
 * and below it a list that gives way to the file with a back button.
 */
export function FilesTabBody({
  gameId,
  previewToken,
  version,
  selectedPath,
  onSelectPath,
}: FilesTabBodyProps) {
  const t = useTranslations("ChatFiles")
  const { state, retry } = useFileTree(gameId, version)
  /**
   * Warms the browser's HTTP cache for a text file the pointer rests on, so
   * the click that usually follows opens it from cache. One prefetcher per
   * version: a new version is a new set of URLs, and the old "already
   * loaded" set no longer says anything about them.
   */
  const prefetcher = useMemo(
    () =>
      createHoverPrefetcher(async (url) => {
        const response = await fetch(url)
        // A failed read is not cached, so it must not count as warmed either.
        if (!response.ok) throw new Error(String(response.status))
        await response.arrayBuffer()
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the URLs carry gameId and version; a new prefetcher per version is the point
    [gameId, version]
  )

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {t("startingSandbox")}
      </div>
    )
  }

  if (state.status === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        {t("treeFailed")}
        <Button variant="outline" size="sm" onClick={retry}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  const selected = selectedPath ? findFile(state.tree, selectedPath) : undefined
  const tree =
    state.tree.length === 0 ? (
      <p className="p-2 text-sm text-muted-foreground">{t("empty")}</p>
    ) : (
      <FileTree
        nodes={state.tree}
        selectedPath={selectedPath}
        onSelect={(path) => {
          // A click already loads the file; a hover still pending would only duplicate it.
          prefetcher.hover(null)
          onSelectPath(path)
        }}
        onPrefetch={(path) => {
          const file = path ? findFile(state.tree, path) : undefined
          prefetcher.hover(
            file && isPrefetchableText(file) ? fileContentUrl(gameId, file.path, version) : null
          )
        }}
      />
    )
  const detail = selected ? (
    <FileViewer gameId={gameId} previewToken={previewToken} version={version} file={selected} />
  ) : (
    <p className="p-4 text-sm text-muted-foreground">
      {selectedPath ? t("missing") : t("selectFile")}
    </p>
  )

  return (
    <FilesLayout tree={tree} detail={detail} fileOpen={selectedPath !== null} onBack={() => onSelectPath(null)} />
  )
}

/**
 * One tree and one viewer, rearranged by the `@2xl:` container query rather
 * than rendered once per layout: the viewer fetches, so a second copy hidden
 * with CSS would still request every file twice. Below the breakpoint the
 * tree gives way to the open file and a back button brings it back.
 */
export function FilesLayout({
  tree,
  detail,
  fileOpen,
  onBack,
}: {
  tree: React.ReactNode
  detail: React.ReactNode
  fileOpen: boolean
  onBack: () => void
}) {
  const t = useTranslations("ChatFiles")

  return (
    <div className="flex min-h-0 flex-1 flex-col @2xl:flex-row">
      <div
        className={cn(
          "no-scrollbar min-h-0 flex-1 scroll-fade overflow-y-auto overscroll-contain p-2 @2xl:w-64 @2xl:flex-none @2xl:border-e",
          fileOpen && "max-@2xl:hidden"
        )}
      >
        {tree}
      </div>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          !fileOpen && "max-@2xl:hidden"
        )}
      >
        {fileOpen ? (
          <div className="shrink-0 p-2 @2xl:hidden">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              {t("back")}
            </Button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">{detail}</div>
      </div>
    </div>
  )
}
