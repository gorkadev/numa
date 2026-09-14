"use client"

import { useState } from "react"

import {
  Alert01Icon,
  ArrowDown01Icon,
  CircleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import type { TaskStripTask } from "@/lib/games/plan-tasks"

/**
 * One task's status icon — the four-way vocabulary `TaskStripTask.status`
 * draws: hollow circle (not started), the same `Spinner` a running
 * sub-agent entry uses elsewhere in this thread, a muted check, or the
 * destructive-tinted alert `subagent-entry.tsx`/`tool-group.tsx` already use
 * for a failed run or tool call.
 */
function TaskStatusIcon({ status }: { status: TaskStripTask["status"] }) {
  if (status === "running") return <Spinner />

  if (status === "done") {
    return (
      <HugeiconsIcon
        icon={Tick02Icon}
        strokeWidth={2}
        className="text-muted-foreground size-4"
      />
    )
  }

  if (status === "failed") {
    return (
      <HugeiconsIcon
        icon={Alert01Icon}
        strokeWidth={2}
        className="text-destructive size-4"
      />
    )
  }

  return (
    <HugeiconsIcon
      icon={CircleIcon}
      strokeWidth={2}
      className="text-muted-foreground size-4"
    />
  )
}

/** The collapsed row's own task: the first running task, else the first failed one, else the first still pending — `tasks` is never empty here (`chat-thread.tsx` only renders this component when `shouldShowTaskStrip` already confirmed that). */
function currentTask(tasks: readonly TaskStripTask[]): TaskStripTask {
  const fallback = tasks.at(-1)

  if (!fallback) {
    throw new Error("TaskStrip rendered with an empty task list")
  }

  return (
    tasks.find((task) => task.status === "running") ??
    tasks.find((task) => task.status === "failed") ??
    tasks.find((task) => task.status === "pending") ??
    // Every task is done, but the strip is still showing because the turn is
    // still streaming (`shouldShowTaskStrip`'s own streaming clause) — the
    // last task is as reasonable a "current" one as any to name.
    fallback
  )
}

/**
 * The compact, collapsible task list attached to the top of the chat
 * composer — Cursor's "pending tasks" strip. `chat-thread.tsx` derives
 * `tasks` with `lib/games/plan-tasks.ts` and decides whether to render this
 * at all (`shouldShowTaskStrip`); this component only draws whatever list it
 * is handed.
 *
 * Visually a continuation of the composer's own card: same `rounded-2xl`/
 * `bg-input/50` family, its own top corners rounded and bottom corners
 * square so it sits flush above `ChatComposer`'s `InputGroup`, which squares
 * its own top corners in turn (`chat-composer.tsx`'s `tasksSlot` prop) — one
 * continuous shape with a single hairline border between the two halves,
 * not a floating card of its own.
 */
export function TaskStrip({ tasks }: { tasks: TaskStripTask[] }) {
  const [open, setOpen] = useState(false)

  const doneCount = tasks.filter((task) => task.status === "done").length
  const current = currentTask(tasks)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="m-auto w-[calc(100%-3rem)] rounded-t-2xl bg-muted/50"
    >
      {/**
       * `CollapsibleTrigger` renders a native `<button>` and wires
       * `aria-expanded`/`aria-controls` to the panel itself — the same Base
       * UI primitive `accordion.tsx` builds on, styled directly rather than
       * through `Marker` (that component's chat-bubble-line styling is not
       * this card-shaped strip's visual family).
       */}
      <CollapsibleTrigger
        className="flex items-center gap-2 rounded-t-2xl px-2.5 py-2 text-left text-sm hover:text-foreground focus-visible:outline-none"
        style={{ width: "stretch" }}
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
        <span className="shrink-0">
          <TaskStatusIcon status={current.status} />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            current.status === "running" && "shimmer"
          )}
        >
          {current.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          ({doneCount}/{tasks.length})
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden motion-reduce:animate-none data-open:animate-collapsible-down data-closed:animate-collapsible-up">
        {/**
         * The `h-(--collapsible-panel-height)` clamp, and its own
         * `data-starting-style`/`data-ending-style` zeroing, is the exact
         * pattern `accordion.tsx`'s `AccordionContent` uses for its own
         * Base UI panel — `--collapsible-panel-height` is Collapsible.Panel's
         * own exposed var, the non-accordion counterpart of that component's
         * `--accordion-panel-height`.
         */}
        <div className="data-ending-style:h-0 data-starting-style:h-0 bg-muted/50 p-2 mx-4 rounded-t-2xl">
          <ul className="flex flex-col gap-1.5 px-2.5 pb-2 text-sm">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2">
                <span className="shrink-0">
                  <TaskStatusIcon status={task.status} />
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    task.status === "running" && "shimmer",
                    task.status === "done" &&
                      "text-muted-foreground line-through",
                    task.status === "failed" && "text-destructive"
                  )}
                  title={task.status === "running" ? task.activity : undefined}
                >
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
