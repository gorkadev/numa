"use client"

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@workspace/ui/components/item"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

import { subagentStatusLabel } from "@/components/chat/subagent-entry"
import { SubagentRunDetail } from "@/components/chat/subagent-run-detail"
import type { SubagentRunRecord } from "@/lib/games/harness/records"

export type SubagentSheetProps = {
  /** Every sub-agent run recorded on this thread so far, in dispatch order. */
  records: SubagentRunRecord[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * `null` shows the run list; an `agentId` shows that run's detail.
   * Controlled, alongside `open`, so 10b can lift both in
   * `chat-thread.tsx`/`game-chat.tsx`: the thread-header button and an
   * inline `SubagentEntry` both drive this same panel (design.md
   * decision 16).
   */
  selectedRunId: string | null
  onSelectRun: (agentId: string | null) => void
}

/**
 * The right-side panel `subagent-view` calls for: opened from the thread
 * header to list every recorded run (`displayName` primary, role
 * secondary — `subagent-view`'s Sub-Agents Are Presented as Named Bots
 * requirement), or opened straight onto one run's detail from its inline
 * entry.
 *
 * Purely props-driven, same as `SubagentRunDetail`: a caller re-rendering
 * with a newer `records` array is what makes a selected run's detail "keep
 * updating while it runs".
 */
export function SubagentSheet({
  records,
  open,
  onOpenChange,
  selectedRunId,
  onSelectRun,
}: SubagentSheetProps) {
  const selected =
    records.find((record) => record.agentId === selectedRunId) ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sub-agent runs</SheetTitle>
          <SheetDescription>
            Every sub-agent this thread has dispatched.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          {selected ? (
            <div className="flex flex-col gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="-ms-2 w-fit"
                onClick={() => onSelectRun(null)}
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                All runs
              </Button>
              <SubagentRunDetail record={selected} />
            </div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sub-agent runs yet.
            </p>
          ) : (
            <ItemGroup>
              {records.map((record) => (
                <Item
                  key={record.agentId}
                  render={<button type="button" />}
                  onClick={() => onSelectRun(record.agentId)}
                >
                  <ItemContent>
                    <ItemTitle>{record.displayName}</ItemTitle>
                    <ItemDescription>{record.role}</ItemDescription>
                  </ItemContent>
                  <span className="text-xs text-muted-foreground">
                    {record.status === "running"
                      ? record.activity
                      : subagentStatusLabel(record.status)}
                  </span>
                </Item>
              ))}
            </ItemGroup>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
