"use client"

import { useState } from "react"

import { ArrowRight01Icon, File01Icon, Folder01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

import type { FileTreeNode } from "@/lib/games/files"

type FileTreeProps = {
  nodes: FileTreeNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
  className?: string
}

/**
 * The game directory as folders you can open, built the way the shadcn File
 * Tree pattern builds it: a folder is a `Collapsible`, a file is a ghost
 * `Button`.
 *
 * Only the top level starts open, plus whatever folders lead to the selected
 * file — a template's `engine/` holds dozens of files nobody came to read,
 * while returning to the tab should land back on the file that was open.
 * Folders own their open state after that (`defaultOpen`), so a refresh of
 * the tree after a turn does not fold away what the reader opened.
 */
export function FileTree({ nodes, selectedPath, onSelect, className }: FileTreeProps) {
  return (
    <div className={cn("flex flex-col text-sm", className)}>
      {nodes.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function FileTreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  if (node.type === "file") {
    const selected = node.path === selectedPath

    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("w-full justify-start font-normal", selected && "bg-muted")}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(node.path)}
      >
        <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
        <span className="min-w-0 truncate">{node.name}</span>
      </Button>
    )
  }

  return (
    <FolderItem node={node} depth={depth} selectedPath={selectedPath} onSelect={onSelect} />
  )
}

function FolderItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: Extract<FileTreeNode, { type: "folder" }>
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  /** Read once: Base UI warns when an uncontrolled Collapsible's `defaultOpen` changes after mount, which selecting a file inside it would do. */
  const [defaultOpen] = useState(
    () => depth === 0 || (selectedPath?.startsWith(`${node.path}/`) ?? false)
  )

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal aria-expanded:bg-transparent aria-expanded:hover:bg-muted dark:aria-expanded:hover:bg-muted/50"
          />
        }
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="transition-transform group-data-panel-open/button:rotate-90"
        />
        <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />
        <span className="min-w-0 truncate">{node.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ms-4 flex flex-col">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
