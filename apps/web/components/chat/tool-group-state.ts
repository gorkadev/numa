import { isSettled, toolError, type ToolPart } from "@/lib/games/tool-parts"

export function stepStatus(part: ToolPart): "error" | "running" | undefined {
  if (toolError(part) !== null) return "error"
  return isSettled(part) ? undefined : "running"
}

export function groupState(parts: ToolPart[]) {
  const running = parts.some((part) => !isSettled(part))
  const failed = parts.filter((part) => toolError(part) !== null).length
  return {
    count: parts.length,
    failed,
    running,
    status: running
      ? ("running" as const)
      : failed > 0
        ? ("error" as const)
        : undefined,
  }
}

export function resolveGroupOpen(manualOpen: boolean | null, running: boolean) {
  return manualOpen ?? running
}
