import { Alert01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

import { subagentStatusLabel } from "@/components/chat/subagent-entry"
import type { SubagentRunRecord } from "@/lib/games/harness/records"

export type SubagentRunDetailProps = {
  record: SubagentRunRecord
}

/**
 * Full detail for one sub-agent run, shown inside `SubagentSheet` once a run
 * is selected (`subagent-view`'s Sub-Agent Runs Are Openable From the Thread
 * and Sub-Agents Are Presented as Named Bots requirements — the concrete
 * model belongs here, not on the inline entry or the run list).
 *
 * Purely props-driven: there is no internal state to go stale. A caller
 * re-rendering this component with a newer `record` — the next throttled
 * snapshot `run-subagent.ts` yields (design.md decision 5) — is the entire
 * "keeps updating while it runs" behavior the spec asks for.
 */
export function SubagentRunDetail({ record }: SubagentRunDetailProps) {
  const running = record.status === "running"

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <h3 className="font-heading text-base font-medium text-foreground">
          {record.displayName}
        </h3>
        <p className="text-xs text-muted-foreground">{record.role}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{record.tier}</Badge>
        <Badge variant="outline">{record.slot}</Badge>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Status</span>
        <span className={running ? "shimmer" : undefined}>
          {running ? record.activity : subagentStatusLabel(record.status)}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Model</span>
        <span>{record.modelName}</span>
      </div>

      {record.summary ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Summary</span>
          <p className="whitespace-pre-wrap">{record.summary}</p>
        </div>
      ) : null}

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          Tool calls ({record.toolCalls.length})
        </span>
        {record.toolCalls.length === 0 ? (
          <p className="text-muted-foreground">No tool calls yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {record.toolCalls.map((call) => (
              <li key={call.toolCallId} className="flex items-start gap-2">
                <HugeiconsIcon
                  icon={call.ok ? Tick02Icon : Alert01Icon}
                  strokeWidth={2}
                  className={cn(
                    "mt-0.5 size-4 shrink-0 text-muted-foreground",
                    !call.ok && "text-destructive"
                  )}
                />
                {/**
                 * The error text goes in `title`, the same place
                 * `tool-group.tsx`'s `ToolMarker` puts it: written for
                 * recovery, not for the player to act on, so it stays one
                 * hover away rather than always on screen.
                 */}
                <span
                  className={!call.ok ? "text-destructive" : undefined}
                  title={call.error}
                >
                  {call.toolName}
                  {call.path ? ` ${call.path}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          Edited files ({record.edits.length})
        </span>
        {record.edits.length === 0 ? (
          <p className="text-muted-foreground">No files edited yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {record.edits.map((path) => (
              <li key={path} className="font-mono text-xs">
                {path}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <TokenStat label="Input" value={record.tokens.inputTokens} />
        <TokenStat label="Output" value={record.tokens.outputTokens} />
        <TokenStat
          label="Cached input"
          value={record.tokens.cachedInputTokens}
        />
        <TokenStat label="Reasoning" value={record.tokens.reasoningTokens} />
      </div>
    </div>
  )
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value.toLocaleString()}</span>
    </div>
  )
}
