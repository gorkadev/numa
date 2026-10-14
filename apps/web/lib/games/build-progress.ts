import type { UIMessageChunk } from "ai"

export const GAME_BUILD_PHASES = [
  "workspace",
  "planning",
  "building",
  "verifying",
  "finalizing",
] as const

export type GameBuildPhase = (typeof GAME_BUILD_PHASES)[number]

const PART_TYPE = "data-game-progress"

export function gameProgressChunk(phase: GameBuildPhase): UIMessageChunk {
  return { type: PART_TYPE, data: { phase }, transient: true }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Reads only the exact host-authored build-progress stream part. */
export function readGameProgress(part: unknown): GameBuildPhase | null {
  if (!isRecord(part) || part.type !== PART_TYPE || !isRecord(part.data)) return null

  const data = part.data

  if (Object.keys(data).length !== 1 || !("phase" in data)) return null

  const phase = data.phase

  return GAME_BUILD_PHASES.includes(phase as GameBuildPhase) ? (phase as GameBuildPhase) : null
}

/** Removes progress notifications without changing supplied messages or malformed parts. */
export function withoutGameProgress<T>(messages: readonly T[]): T[]
export function withoutGameProgress(messages: unknown): unknown[]
export function withoutGameProgress(messages: unknown): unknown[] {
  if (!Array.isArray(messages)) return []

  return messages.map((message) => {
    if (!isRecord(message) || !Array.isArray(message.parts)) return message

    const parts = message.parts.filter(
      (part) => !isRecord(part) || part.type !== PART_TYPE
    )

    return parts.length === message.parts.length ? message : { ...message, parts }
  })
}

export type GameBuildProgress =
  | { kind: "submit" }
  | { kind: "phase"; phase: GameBuildPhase }
  | { kind: "reconnecting" }
  | null

export type GameBuildProgressEvent =
  | { type: "submit" }
  | { type: "server-phase"; phase: GameBuildPhase }
  | { type: "reconnect-start" | "reconnect-end" }
  | { type: "finish" | "abort" | "disconnect" | "error" }

/** Pure client lifecycle reducer; every terminal path clears stale progress. */
export function reduceGameBuildProgress(
  _current: GameBuildProgress,
  event: GameBuildProgressEvent
): GameBuildProgress {
  switch (event.type) {
    case "submit":
      return { kind: "submit" }
    case "server-phase":
      return { kind: "phase", phase: event.phase }
    case "reconnect-start":
      return { kind: "reconnecting" }
    case "reconnect-end":
      return _current?.kind === "reconnecting" ? null : _current
    case "finish":
    case "abort":
    case "disconnect":
    case "error":
      return null
  }
}

export function gameBuildProgressLabelKey(
  progress: GameBuildProgress
): `buildProgress.${"submit" | "reconnecting" | GameBuildPhase}` | null {
  if (progress === null) return null

  if (progress.kind === "submit") return "buildProgress.submit"
  if (progress.kind === "reconnecting") return "buildProgress.reconnecting"

  return `buildProgress.${progress.phase}`
}
