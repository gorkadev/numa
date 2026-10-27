"use client"

import { useEffect, useState } from "react"

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"

import { FileTree } from "@/components/chat/file-tree"
import { FileViewer } from "@/components/chat/file-viewer"
import { Spinner } from "@/components/localized-spinner"
import { findFile, type FileTreeNode } from "@/lib/games/files"

type TreeState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; tree: FileTreeNode[] }

/**
 * The game directory, fetched when the tab mounts and again whenever the
 * revision moves — a turn that wrote files is exactly when the listing goes
 * stale, so there is nothing to poll for in between. The first fetch is also
 * what resumes an archived sandbox, so its loading state says so.
 *
 * A refetch keeps the current tree on screen instead of falling back to the
 * loading state: the tree only changes by a file or two per turn, and
 * blanking it would throw away the reader's place.
 */
function useFileTree(gameId: string, revision: number) {
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
  }, [gameId, revision, attempt])

  function retry() {
    setState({ status: "loading" })
    setAttempt((count) => count + 1)
  }

  return { state, retry }
}

type FilesTabBodyProps = {
  gameId: string
  previewToken: string
  revision: number
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
  revision,
  selectedPath,
  onSelectPath,
}: FilesTabBodyProps) {
  const t = useTranslations("ChatFiles")
  const { state, retry } = useFileTree(gameId, revision)

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
      <FileTree nodes={state.tree} selectedPath={selectedPath} onSelect={onSelectPath} />
    )
  const detail = selected ? (
    <FileViewer gameId={gameId} previewToken={previewToken} revision={revision} file={selected} />
  ) : (
    <p className="p-4 text-sm text-muted-foreground">
      {selectedPath ? t("missing") : t("selectFile")}
    </p>
  )

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col @2xl:hidden">
        {selectedPath ? (
          <>
            <div className="shrink-0 p-2">
              <Button variant="ghost" size="sm" onClick={() => onSelectPath(null)}>
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                {t("back")}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{detail}</div>
          </>
        ) : (
          <div className="no-scrollbar min-h-0 flex-1 scroll-fade overflow-y-auto overscroll-contain p-2">
            {tree}
          </div>
        )}
      </div>
      <div className="hidden min-h-0 flex-1 @2xl:flex">
        <div className="no-scrollbar min-h-0 w-64 shrink-0 scroll-fade overflow-y-auto overscroll-contain border-e p-2">
          {tree}
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{detail}</div>
      </div>
    </>
  )
}
