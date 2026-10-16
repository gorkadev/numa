/** Client-safe metadata presentation; never consult today's registry for history. */
const EFFORTS = ["minimal", "low", "medium", "high"] as const
type Effort = (typeof EFFORTS)[number]

function isEffort(value: unknown): value is Effort {
  return EFFORTS.some((effort) => effort === value)
}

export function presentRunModel(record: { modelName?: string; effort?: unknown }) {
  const match = record.modelName?.match(/^(.+) \((minimal|low|medium|high)\)$/)
  const candidate = record.effort !== undefined ? record.effort : match?.[2]
  return {
    modelName: match?.[1] ?? record.modelName,
    effort: isEffort(candidate) ? candidate : undefined,
  }
}
