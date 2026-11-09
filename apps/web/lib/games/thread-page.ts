import type { UIMessage } from "ai"

import type { SessionStats } from "@/lib/ai/session-usage"
import type { MessageAnimationId } from "@/lib/chat/message-animations"
import type { SubagentRunRecord } from "@/lib/games/harness/records"
import type { TemplateId } from "@/lib/games/templates/catalog"
import type { StoredOutlineTurn } from "@/lib/games/thread-outline"
import { trimMessage } from "@/lib/games/tool-parts"

/**
 * How many turns one page of history holds at most. Pages are counted in turns
 * rather than messages so each starts on a user message: `groupRuns` folds
 * consecutive assistant messages into one row, and a page starting between them
 * would change that row's identity when the page before it arrives.
 */
export const THREAD_PAGE_TURNS = 5

/** Tool output makes a turn's weight vary wildly, so turns alone do not bound a response. */
export const THREAD_PAGE_BYTES = 256 * 1024

export const OUTLINE_PAGE_TURNS = 200
export const OUTLINE_TEXT_CHARS = 160
export const SUBAGENT_PAGE_RUNS = 100

/** Far under Postgres's 65535 bind parameters, and it keeps one statement's payload small. */
export const SAVE_CHUNK_ROWS = 500

/** The largest value `position`, a Postgres `integer`, can hold. */
const MAX_POSITION = 2_147_483_647

/** The thread as the browser caches it: the loaded tail and what lies before it. */
export type ThreadSnapshot = {
  messages: UIMessage[]
  /** Position of the oldest loaded message; 0 means nothing earlier exists. */
  cursor: number
  /** Totals of everything stored when this was read, loaded or not. */
  stats: SessionStats | null
}

export type ThreadPage = { messages: UIMessage[]; start: number }

/** A page of a list ordered by position; `next` is null on the last one. */
export type StoredOutlinePage = { turns: StoredOutlineTurn[]; next: number | null }

/** A run as the list route returns it, without what only its detail reads. */
export type ListedSubagentRun = Omit<
  SubagentRunRecord,
  "timeline" | "toolCalls" | "prompt" | "summary"
>

export type SubagentRunPage = { runs: ListedSubagentRun[]; next: number | null }

/** A record whose detail fields are placeholders until the run is opened. */
export type PanelRun = SubagentRunRecord & { listed?: true }

/**
 * `size` is what the row weighs to the browser, not what it holds: it only ever
 * sets page bounds, and those limit a response. A row written before this kept
 * its stored weight, which is higher, so its pages only come out smaller.
 */
export function threadRows(gameId: string, messages: UIMessage[]) {
  const encoder = new TextEncoder()

  return messages.map((message, position) => ({
    gameId,
    position,
    role: message.role,
    message,
    size: encoder.encode(JSON.stringify(trimMessage(message))).length,
  }))
}

export function subagentRows(gameId: string, runs: SubagentRunRecord[]) {
  return runs.map((run, position) => ({
    gameId,
    agentId: run.agentId,
    position,
    record: run as Record<string, unknown>,
  }))
}

/**
 * Where a page ending at the last of `rows` starts: the oldest turn that still
 * fits, walking back from the newest. A turn is never split, so the newest one
 * stays whole even over the ceiling; rows ahead of the first user message have
 * no turn of their own and travel with it.
 */
export function pageStart(
  rows: readonly { position: number; role: string; size: number }[]
): number {
  let bytes = 0
  let turns = 0
  let start: number | undefined

  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]!

    bytes += row.size

    if (start !== undefined && bytes > THREAD_PAGE_BYTES) return start
    if (row.role !== "user") continue

    start = row.position
    turns += 1

    if (turns === THREAD_PAGE_TURNS) return start
  }

  return rows[0]?.position ?? 0
}

/**
 * Everything cached for one game, whatever turn it was read at. Thread data
 * only: the `games` row changes between turns, so it is never held here.
 */
export function threadScope(gameId: string) {
  return ["thread", gameId] as const
}

/**
 * `lastTurnFinishedAt` is part of the key because it arrives with the game row
 * on every navigation: a turn finished in another tab or on another device
 * misses this cache without any realtime delivery reaching this one.
 */
export function threadQueryKey(gameId: string, lastTurnFinishedAt: number) {
  return [...threadScope(gameId), lastTurnFinishedAt] as const
}

/**
 * The cached thread, when it can stand in for a read. A working agent is
 * changing the thread, and an empty one is the moment before a first prompt
 * lands: both would mount a chat that has no history to reconnect from.
 */
export function reusableThread(
  cached: ThreadSnapshot | undefined,
  working: boolean
): ThreadSnapshot | null {
  if (working || !cached || cached.messages.length === 0) return null

  return cached
}

/**
 * What a game's route needs from the server. Kept to what the page draws: the
 * owner, the sandbox id and the read marks stay on the server, and `unread`
 * travels as the answer rather than as the marks it was computed from.
 */
export type GameRow = {
  id: string
  title: string
  pinned: boolean
  templateId: TemplateId
  previewToken?: string
  /** In epoch ms, 0 for none. */
  lastTurnFinishedAt: number
  session?: { publicAccessToken: string; lastEventId?: string }
  unread: boolean
  settings: {
    wrapCodeBlocks: boolean
    showSessionStats: boolean
    messageAnimation: MessageAnimationId
  }
}

/**
 * Apart from `threadScope` because the two age differently: the thread is kept
 * until a turn changes it, while the row is shown from cache and read again on
 * every entry.
 */
export function gameRowQueryKey(gameId: string) {
  return ["game", gameId] as const
}

/**
 * Whether a revalidated row means the mounted thread is out of date. A working
 * game is still writing it, and a thread that followed the turn itself already
 * holds what the row reports, so remounting either would only lose the reader's
 * place.
 */
export function replacesThread({
  seen,
  revalidated,
  working,
  held,
}: {
  seen: number
  revalidated: number
  working: boolean
  held: boolean
}): boolean {
  return revalidated !== seen && !working && !held
}

/** Keeps pages in the cache, so coming back mounts with everything already read. */
export function withEarlierPage(
  snapshot: ThreadSnapshot | undefined,
  page: ThreadPage
): ThreadSnapshot | undefined {
  if (!snapshot) return undefined

  return {
    ...snapshot,
    messages: mergeEarlierMessages(snapshot.messages, page.messages),
    cursor: page.start,
  }
}

/** `undefined` when absent, `null` when present and not a position. */
export function parseCursor(raw: string | null): number | null | undefined {
  if (raw === null) return undefined

  const cursor = Number(raw)

  return raw !== "" && Number.isSafeInteger(cursor) && cursor >= 0 && cursor <= MAX_POSITION
    ? cursor
    : null
}

/** Postgres rejects anything else in a uuid column, which would surface as a 500. */
export function isGameId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/**
 * A running turn can have saved a message the browser already holds, and that
 * live copy is the one being streamed into, so it wins over the stored one.
 */
export function mergeEarlierMessages(
  current: UIMessage[],
  older: UIMessage[]
): UIMessage[] {
  const held = new Set(current.map(({ id }) => id))

  return [...older.filter(({ id }) => !held.has(id)), ...current]
}

/** Live records hold the whole run, so one replaces its row wherever the list has it. */
export function mergeSubagentRuns(
  listed: ListedSubagentRun[],
  live: SubagentRunRecord[]
): PanelRun[] {
  const byId = new Map(live.map((run) => [run.agentId, run]))
  const known = new Set(listed.map(({ agentId }) => agentId))

  return [
    ...listed.map(
      (run): PanelRun =>
        byId.get(run.agentId) ?? {
          ...run,
          timeline: [],
          toolCalls: [],
          prompt: "",
          summary: "",
          listed: true,
        }
    ),
    ...live.filter(({ agentId }) => !known.has(agentId)),
  ]
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return a.length - b.length

  const index = a.findIndex((byte, at) => byte !== b[at])

  return index === -1 ? 0 : a[index]! - b[index]!
}

function canonical(value: unknown, encoder: TextEncoder): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item, encoder)).join(", ")}]`
  }

  if (typeof value !== "object" || value === null) return JSON.stringify(value)

  const fields = Object.entries(value)
    .map(([key, item]) => ({ key, bytes: encoder.encode(key), item }))
    .sort((a, b) => compareBytes(a.bytes, b.bytes))
    .map(({ key, item }) => `${JSON.stringify(key)}: ${canonical(item, encoder)}`)

  return `{${fields.join(", ")}}`
}

/**
 * A value as Postgres prints it back from `jsonb`: keys by byte length, then
 * bytes, with a space after every separator. `md5(message::text)` hashes that
 * text, not `JSON.stringify`'s, so this is what makes the two comparable.
 *
 * A number Postgres normalizes differently only reads as changed, and a changed
 * row is merely rewritten, so being wrong here costs a write and never a save.
 */
export function jsonbText(value: unknown): string {
  return canonical(JSON.parse(JSON.stringify(value)), new TextEncoder())
}

/** The rows a save has to send: anything absent from `stored` or hashing differently. */
export function changedRows<Row extends { position: number }>(
  rows: Row[],
  stored: ReadonlyMap<number, string>,
  hash: (row: Row) => string
): Row[] {
  return rows.filter((row) => stored.get(row.position) !== hash(row))
}

export function chunkRows<Row>(rows: Row[], size: number): Row[][] {
  const chunks: Row[][] = []

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }

  return chunks
}
