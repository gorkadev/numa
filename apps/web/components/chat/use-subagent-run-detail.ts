"use client"

import { createContext, use } from "react"

import { useQuery } from "@tanstack/react-query"

import type { SubagentRunRecord } from "@/lib/games/harness/records"
import type { PanelRun, threadQueryKey } from "@/lib/games/thread-page"

export type ThreadKey = ReturnType<typeof threadQueryKey>

/** The key this game's mount read its thread under, for the panels below it. */
export const ThreadKeyContext = createContext<ThreadKey | null>(null)

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) throw new Error(`Request failed: ${response.status}`)

  return response.json() as Promise<T>
}

/**
 * A listed run's whole record, read when it is opened and kept from then on.
 * The panel and the thread's inline entry share the query, so whichever opens
 * a run second reads nothing.
 *
 * Apart from the other thread reads so a row of the thread does not import the
 * activity provider just to open a run.
 */
export function useSubagentRunDetail(record: PanelRun) {
  const threadKey = use(ThreadKeyContext)

  return useQuery({
    queryKey: [...(threadKey ?? []), "subagent", record.agentId],
    enabled: record.listed === true && threadKey !== null,
    queryFn: () =>
      getJson<SubagentRunRecord>(
        `/api/games/${threadKey?.[1]}/subagents/${encodeURIComponent(record.agentId)}`
      ),
  })
}
