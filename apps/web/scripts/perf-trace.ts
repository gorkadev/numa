import { writeFileSync } from "node:fs"

/**
 * Prints where the time went in one `game-chat` run, per turn, from its
 * Trigger.dev trace.
 *
 * Run manually with `pnpm perf:trace <runId> [--json out.json] [--no-tokens]`
 * (from `apps/web`). It is the measuring stick for harness performance work:
 * run the same brief before and after a change and compare the two reports.
 *
 * For every turn it reports the orchestrator and each sub-agent it dispatched:
 * wall time, LLM time against tool time, steps with the tools each one called,
 * token usage, and each sub-agent's start offset inside its dispatch tool call.
 * That offset is what exposes serialization: parallel workers all start near
 * +0s, while a worker waiting on a `dependsOn` starts when its dependency ends.
 *
 * Token counts come from one span-detail request per LLM call, because the
 * trace endpoint carries timings but no span properties; `--no-tokens` skips
 * them for a quick look at a run that is still going.
 */

const API = "https://api.trigger.dev"

/** Which sub-agent role each dispatch tool runs, to label nested agents. */
const DISPATCH_ROLE: Record<string, string> = {
  explore: "explorer",
  plan: "planner",
  run_tasks: "worker",
  verify: "verifier",
}

type Span = {
  id: string
  data: { message: string; startTime: string; duration: number; isPartial: boolean }
  children?: Span[]
}

type Ai = {
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  finishReason?: string
}

type ChatCall = { spanId: string; ms: number; ai?: Ai; error?: string }

type Tokens = { input: number; output: number; cached: number; reasoning: number }

type Step = { ms: number; chatMs: number; tools: string[] }

type Agent = {
  model: string
  wallMs: number
  steps: Step[]
  llmMs: number
  toolMs: Record<string, number>
  toolCount: Record<string, number>
  daytonaGet: { n: number; ms: number }
  subagents: Agent[]
  tokens: Tokens
  chat: ChatCall[]
  role?: string
  viaTool?: string
  offsetMs?: number
}

const args = process.argv.slice(2)
const runId = args.find((arg) => arg.startsWith("run_"))
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined
const withTokens = !args.includes("--no-tokens")
const key = process.env.TRIGGER_SECRET_KEY

if (!runId) {
  throw new Error("Usage: pnpm perf:trace <runId> [--json out.json] [--no-tokens]")
}

if (!key) {
  throw new Error("TRIGGER_SECRET_KEY is not set; run through `pnpm perf:trace` so .env.local is loaded.")
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } })

  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${await res.text()}`)
  }

  return (await res.json()) as T
}

/** Span durations arrive in nanoseconds. */
const ms = (span: Span) => span.data.duration / 1e6
const start = (span: Span) => new Date(span.data.startTime).getTime()
const name = (span: Span) => span.data.message
const kids = (span: Span) => span.children ?? []
const secs = (value: number) => `${(value / 1000).toFixed(1)}s`

function findAll(span: Span, match: (span: Span) => boolean, out: Span[] = []): Span[] {
  if (match(span)) {
    out.push(span)
  }

  for (const child of kids(span)) {
    findAll(child, match, out)
  }

  return out
}

/** Every LLM call across the run, filled with token usage by `fillTokens`. */
const chatCalls: ChatCall[] = []

/** The `invoke_agent` spans under `span` that no other `invoke_agent` under it contains. */
function outermostAgents(span: Span): Span[] {
  return kids(span).flatMap((child) =>
    name(child).startsWith("invoke_agent ") ? [child] : outermostAgents(child)
  )
}

function summarizeAgent(agentSpan: Span): Agent {
  const agent: Agent = {
    model: name(agentSpan).replace("invoke_agent ", ""),
    wallMs: ms(agentSpan),
    steps: [],
    llmMs: 0,
    toolMs: {},
    toolCount: {},
    daytonaGet: { n: 0, ms: 0 },
    subagents: [],
    tokens: { input: 0, output: 0, cached: 0, reasoning: 0 },
    chat: [],
  }

  for (const step of kids(agentSpan).filter((child) => /^step \d+/.test(name(child)))) {
    const chat = kids(step).filter((child) => name(child).startsWith("chat "))
    const tools = kids(step).filter((child) => name(child).startsWith("execute_tool "))
    const chatMs = chat.reduce((sum, call) => sum + ms(call), 0)

    agent.llmMs += chatMs

    for (const call of chat) {
      const entry: ChatCall = { spanId: call.id, ms: ms(call) }
      agent.chat.push(entry)
      chatCalls.push(entry)
    }

    for (const toolSpan of tools) {
      const tool = name(toolSpan).replace("execute_tool ", "")
      const callNumber = (agent.toolCount[tool] ?? 0) + 1

      agent.toolMs[tool] = (agent.toolMs[tool] ?? 0) + ms(toolSpan)
      agent.toolCount[tool] = callNumber

      for (const lookup of findAll(toolSpan, (span) => name(span) === "Daytona.get")) {
        agent.daytonaGet.n++
        agent.daytonaGet.ms += ms(lookup)
      }

      for (const nested of outermostAgents(toolSpan)) {
        const sub = summarizeAgent(nested)
        sub.role = DISPATCH_ROLE[tool] ?? tool
        sub.viaTool = `${tool} call ${callNumber}`
        sub.offsetMs = start(nested) - start(toolSpan)
        agent.subagents.push(sub)
      }
    }

    agent.steps.push({ ms: ms(step), chatMs, tools: tools.map((t) => name(t).replace("execute_tool ", "")) })
  }

  return agent
}

async function fillTokens() {
  const queue = [...chatCalls]
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      try {
        const detail = await get<{ ai?: Ai }>(`/api/v1/runs/${runId}/spans/${entry.spanId}`)
        entry.ai = detail.ai
      } catch (error) {
        entry.error = String(error)
      }
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker))
}

function rollTokens(agent: Agent) {
  for (const call of agent.chat) {
    agent.tokens.input += call.ai?.inputTokens ?? 0
    agent.tokens.output += call.ai?.outputTokens ?? 0
    agent.tokens.cached += call.ai?.cachedTokens ?? 0
    agent.tokens.reasoning += call.ai?.reasoningTokens ?? 0
  }

  agent.subagents.forEach(rollTokens)
}

function printAgent(agent: Agent, indent: number, label: string) {
  const pad = " ".repeat(indent)
  const toolTotal = Object.values(agent.toolMs).reduce((sum, value) => sum + value, 0)
  const other = Math.max(0, agent.wallMs - agent.llmMs - toolTotal)
  const share = agent.wallMs ? Math.round((agent.llmMs / agent.wallMs) * 100) : 0
  const k = (value: number) => `${(value / 1000).toFixed(1)}k`

  console.log(
    `${pad}${label} [${agent.model}] wall ${secs(agent.wallMs)} · ${agent.steps.length} steps · LLM ${secs(agent.llmMs)} (${share}%) · other ${secs(other)}`
  )

  if (withTokens) {
    const perSecond = agent.llmMs ? (agent.tokens.output / (agent.llmMs / 1000)).toFixed(0) : "0"
    console.log(
      `${pad}  tokens in ${k(agent.tokens.input)} (cached ${k(agent.tokens.cached)}) · out ${k(agent.tokens.output)} (reasoning ${k(agent.tokens.reasoning)}) · ${perSecond} out tok/s of LLM time`
    )
  }

  const tools = Object.entries(agent.toolMs)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, value]) => `${tool}×${agent.toolCount[tool]}=${secs(value)}`)

  if (tools.length) {
    console.log(`${pad}  tools ${tools.join(", ")}`)
  }

  if (agent.daytonaGet.n) {
    console.log(`${pad}  Daytona.get ×${agent.daytonaGet.n} = ${secs(agent.daytonaGet.ms)}`)
  }

  console.log(
    `${pad}  steps: ` +
      agent.steps
        .map((step, i) => `${i + 1}:${secs(step.ms)}${step.tools.length ? `[${step.tools.join(",")}]` : ""}`)
        .join(" ")
  )

  const byCall = new Map<string, Agent[]>()

  for (const sub of agent.subagents) {
    byCall.set(sub.viaTool!, [...(byCall.get(sub.viaTool!) ?? []), sub])
  }

  for (const [call, subs] of byCall) {
    subs.forEach((sub, i) =>
      printAgent(sub, indent + 4, `${sub.role}#${i + 1} (${call}, +${secs(sub.offsetMs ?? 0)} after tool start)`)
    )
  }
}

const { trace } = await get<{ trace: { rootSpan: Span } }>(`/api/v1/runs/${runId}/trace`)
const turns = findAll(trace.rootSpan, (span) => /^chat turn \d+/.test(name(span)))

const report = turns.map((turn) => {
  const top = kids(turn).find((child) => name(child).startsWith("invoke_agent "))
  /** The turn span also covers "waiting for next message"; stop the clock where the turn's own work ends. */
  const activeEnd = Math.max(
    ...kids(turn)
      .filter((child) => !name(child).startsWith("waiting for"))
      .map((child) => start(child) + ms(child))
  )

  return {
    turn: name(turn),
    wallMs: activeEnd - start(turn),
    hooks: Object.fromEntries(
      kids(turn)
        .filter((child) => name(child).endsWith("()"))
        .map((child) => [name(child), ms(child)])
    ),
    orchestrator: top ? summarizeAgent(top) : undefined,
  }
})

if (withTokens) {
  await fillTokens()

  for (const turn of report) {
    if (turn.orchestrator) {
      rollTokens(turn.orchestrator)
    }
  }
}

console.log(`Run ${runId} · ${turns.length} turn(s)`)

for (const turn of report) {
  console.log(`\n=== ${turn.turn}: ${secs(turn.wallMs)}`)
  console.log(
    "  hooks " +
      Object.entries(turn.hooks)
        .map(([hook, value]) => `${hook}=${secs(value)}`)
        .join(", ")
  )

  if (turn.orchestrator) {
    printAgent(turn.orchestrator, 2, "orchestrator")
  }
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ runId, report }, null, 2))
}
