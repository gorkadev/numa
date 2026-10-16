"use client"

import { Blobatar } from "@blobatar/react"
import type { SubagentRoleId, SubagentRunStatus } from "@/lib/games/harness/records"
import { agentBotPresentation } from "./agent-bot-presentation"

/** Decorative identity: the adjacent text already names the specialist. */
export function AgentBot({ role, status, size = 32 }: {
  role: SubagentRoleId
  status: SubagentRunStatus
  size?: number
}) {
  return (
    <Blobatar
      {...agentBotPresentation(role, status)}
      size={size}
      className="shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
      focusable={false}
    />
  )
}
