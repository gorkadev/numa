export type AgentRunFilter = "all" | "active" | "finished"

/** Derive from current records on every render; never sort or snapshot live runs. */
export function filterAgentRuns<T extends { status: string }>(
  records: readonly T[],
  filter: AgentRunFilter
): T[] {
  return records.filter((record) =>
    filter === "all" || (filter === "active" ? record.status === "running" : record.status !== "running")
  )
}
