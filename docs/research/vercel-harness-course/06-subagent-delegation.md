# Module 6 — Subagent Delegation
Source lessons:
- Why Delegate — https://vercel.com/academy/build-ai-agent-harness/why-delegate
- Explorer Subagent — https://vercel.com/academy/build-ai-agent-harness/explorer-subagent
- Executor Subagent — https://vercel.com/academy/build-ai-agent-harness/executor-subagent
- Task Tool — https://vercel.com/academy/build-ai-agent-harness/task-tool

## Why Delegate
**Core idea:** Context pruning fixes context-window bloat but not "wrong-shaped work" — exploration, planning, execution, and verification bleeding together inside one agent. Delegation splits the agent into roles (parent plans/decides, subagents do isolated work) so the parent gets back an answer, not the journey.

**Key points:**
- Three single-agent failure modes that pruning cannot catch:
  - **Context pollution** — 20 files read to understand the codebase stay in context; by the time changes start, the relevant files are buried under stale ones.
  - **Lost focus** — by step 30 the agent has drifted from the original task (fixes a CSS typo, refactors an unrelated import, writes a tangential comment) because one agent carries too many concerns and too much rope.
  - **Over-broad capabilities** — an agent with `write`/`bash` "helpfully" edits something during exploration and breaks it; a single agent with the full toolset can't draw its own line between look-and-report vs. act.
  - **Delegation is not free**: a subagent call is a fresh model run — its own startup tokens, its own system prompt, its own latency. Don't delegate everything; delegate only where the parent benefits from *not* seeing the full trace. If the parent could do it in three steps itself, delegation isn't paying for itself.
- Delegate vs. keep-in-parent table:
  | Delegate | Keep in the parent |
  |---|---|
  | Research across many files | Single-file changes |
  | Parallel independent tasks | Sequential dependent changes |
  | Mechanical bulk work | Architectural decisions |
  | Exploration before acting | Ambiguous requirements (use `askUser`) |
- The split criterion: does the work have a "clean handoff shape"? Reading 30 files → one paragraph summary is clean. Choosing between three architectural approaches is not, because the decision **is** the work — it can't be handed off.
- Role split pattern:
  - **Parent**: plans, delegates to Explorer/Executor, synthesizes results, makes architectural decisions. The only agent that asks the user questions or holds the long-term plan.
  - **Explorer subagent**: read/grep only (cannot modify anything), cheap fast model (Haiku), reports findings, does not act.
  - **Executor subagent**: full tools including write/bash, stronger model (Sonnet/Opus), follows precise instructions from the parent, cannot ask the user questions (no `askUser`).

**Code patterns:** None — this is a concept-only lesson (no code to run).

**Applies to numa:**
- Directly validates the target orchestrator design: route small tweaks as direct parent edits, route new-game/big-feature work through phase subagents (understand → design → tasks → parallel specialists → verify) — this lesson is the argument for why that split is worth the extra machinery.
- "Ambiguous requirements → askUser, stays with the parent" maps onto numa's `ask_player` tool — that suspend/resume decision point should stay owned by the orchestrator loop, never delegated into a specialist subagent.
- The "clean handoff shape" test is a good filter for numa's phase boundaries: a gameplay/visuals/audio worker returning a diff + short report is clean; a worker that has to decide *whether* to add a new game system is not, and belongs back with the orchestrator (mirrors gentle-ai's "orchestrator never executes, executors never delegate").
- "Delegation is not free" is a direct warning against over-delegating tiny tweaks in numa's chat.agent — for a one-line `replace_text` fix, keep it in the main loop rather than spinning up a specialist.

## Explorer Subagent
**Core idea:** The explorer is a read-only subagent (no `write`, no `bash`, no `askUser`) spawned fresh per call via a parent-facing `task` tool, running a cheap model with a tight step budget, that investigates a question and returns a clean text summary.

**Key points:**
- Fast Track / exercise requirements: `task` tool schema takes a `description: string`; `execute` instantiates a new `ToolLoopAgent` with only `read` and `grep`; model `claude-haiku-4-5`; `stopWhen: stepCountIs(5)`; return the subagent's text response wrapped in try/catch, errors returned as `"Subagent error: ${e.message}"` strings (never thrown — an uncaught exception breaks the tool loop, and tools must return strings to the model).
- Design rationale called out explicitly:
  - **Fresh agent per call** — the explorer does not survive across calls; each task gets its own context window, which is the point of delegating.
  - **No bash, no askUser** — explorer can read/search only; cannot modify the project or pause for user input; parent stays in charge of decisions.
  - **Haiku, not Sonnet** — exploration is reading/summarizing, not deep reasoning; cheaper/faster model is the right fit.
  - **Five steps** — enough to look at a handful of files and report back; if it needs more, the parent should break the task into smaller pieces.
  - **Errors return as strings** — lets the parent decide what to do instead of crashing the loop.
- Debugging tip: log the subagent's step count and text length from inside the `task` tool's `execute` while developing — otherwise you can't tell if the subagent ran 1 or 5 steps, found anything, or silently failed.
- Reuse the parent's own `read`/`grep` tool instances for the subagent (they're already closed over the sandbox) rather than recreating them.
- Parallel explorers exercise: change the schema to accept an array of descriptions and run them with `Promise.all` for real parallelism (multiple explorers investigating different parts of the codebase at once, synthesized by the parent) — this is genuine concurrency, unlike a single explorer which is just a coroutine.

**Code patterns:**
```ts
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";

export function createTaskTool(sandbox: Sandbox, parentTools: {
  read: ReturnType<typeof createReadTool>;
  grep: ReturnType<typeof createGrepTool>;
}) {
  return tool({
    description: `Delegate research to a read-only subagent.
WHEN TO USE: investigating a codebase, finding patterns, gathering context across many files.
WHEN NOT TO USE: making changes (the subagent cannot write or run commands).
DO NOT USE FOR: tasks that need decisions or askUser interactions.`,
    inputSchema: z.object({
      description: z.string().describe("What the subagent should investigate"),
    }),
    execute: async ({ description }) => {
      const explorer = new ToolLoopAgent({
        model: "anthropic/claude-haiku-4-5",
        instructions: `You are an explorer agent. Investigate and report back concisely.
Working directory: ${sandbox.workingDirectory}`,
        tools: { read: parentTools.read, grep: parentTools.grep },
        stopWhen: stepCountIs(5),
      });
      try {
        const { text, steps } = await explorer.generate({ prompt: description });
        return text ? `[Explorer: ${steps.length} steps]\n${text}` : "(no response from subagent)";
      } catch (e: any) {
        return `Subagent error: ${e.message}`;
      }
    },
  });
}
```
Wired into the parent as a fourth tool alongside `read`, `grep`, `bash`:
```ts
const tools_with_task = { ...tools, task: createTaskTool(sandbox, { read: tools.read, grep: tools.grep }) };
const agent = new ToolLoopAgent({ /* ... */ tools: tools_with_task });
```
Note the exact AI SDK surface used: `ToolLoopAgent` (not `streamText`/`generateText` directly) with `.generate({ prompt })` returning `{ text, steps }`, `stepCountIs(n)` from `ai` as the `stopWhen` predicate, and `tool()` + Zod `inputSchema` for the wrapping tool definition. `model` is passed as a string id (`"anthropic/claude-haiku-4-5"`), not a provider SDK object — version/provider-specific detail worth flagging since numa is on AI SDK v7 with Gemini/Vertex models specified differently.

**Applies to numa:**
- numa's orchestrator (understand/design phases) is a natural `ToolLoopAgent`-style explorer: read-only over the sandbox's `/home/daytona/game` files (via `read_file`/`list_files`), cheap tier model, small step cap — matches the "strong/mid/cheap" tiering already planned.
- The try/catch-to-string error pattern should be adopted verbatim for numa's subagent tool results, since numa tools must also return serializable output through `toModelOutput` rather than throw.
- The "reuse parent's tool instances, don't recreate" pattern applies directly: numa's `read_file`/`list_files` tools are already closed over the sandbox handle and should be passed straight into any subagent rather than rebuilt.
- Parallel explorers via `Promise.all` foreshadows numa's planned parallel specialist workers (gameplay/visuals/audio) — same mechanism, applied to Executors instead of Explorers (see next lesson).

## Executor Subagent
**Core idea:** The executor is the acting counterpart to the explorer — full tools (including a delegated-trust `bash`), a stronger model, and a larger step budget — used for implementation work the parent has already fully specified; it never asks the user anything, that stays with the parent.

**Key points:**
- Exercise requirements: add `subagentType: "explorer" | "executor"` (enum, default `"explorer"`) to the task tool's input schema; when `"executor"`, instantiate a `ToolLoopAgent` with `read`, `grep`, and a **delegated-mode** `bash`; model `claude-sonnet-4-6`; `stopWhen: stepCountIs(15)`; the delegated bash is built via `createApproval({ mode: "delegated", trust: [...] })` with a small trust list (`"npm test"`, `"npm run build"`, `"npx tsc"`).
- Why delegated mode and not interactive: interactive approval mode pauses for a user prompt the executor cannot answer — it would deadlock. The executor needs its own bash instance in delegated mode, not the parent's interactive one.
- Model choice: Sonnet is the right default for executor work; Opus is called out as overkill for most implementation tasks and "slow enough to feel it."
- Trust list is deliberately small/curated by the parent: test runners and build commands are usually safe; package installs and migrations are not. This is the use case that justifies having a discriminated-union approval config (`interactive` vs `delegated`) in the first place (built in an earlier module).
- Comparison table (explorer vs. executor):
  | | Explorer | Executor |
  |---|---|---|
  | Tools | read, grep | read, grep, bash (delegated) |
  | Model | claude-haiku-4-5 | claude-sonnet-4-6 |
  | Step budget | 5 | 15 |
  | Can modify | No | Yes (within trust list) |
  | Can ask user | No | No |
- **Instruction quality matters more for the executor.** The explorer tolerates vague prompts (still produces something useful from looking around); the executor follows instructions literally, so a vague description produces a vague — possibly destructive — result. Bad: `"Fix the auth bug."` Good: `"In src/auth.ts, the login function at line 42 doesn't check for null email. Add a null check before the database query. Run npx tsc --noEmit after the change."` The parent's job is to supply goal, procedure, constraints, and a verification step; the executor's job is to follow them.
- The system prompt line `"Do NOT ask questions."` is doing real work: it forces the executor to act on what it has or fail outright, instead of stalling for clarification it has no channel to request.
- Advanced/exercise idea (not built in the lesson): thread the parent's trust list through to the executor instead of hardcoding it, and consider whether nested delegation should shrink the trust set at each level — the lesson explicitly leaves this an open design question ("production harnesses do this differently").

**Code patterns:**
```ts
if (subagentType === "executor") {
  const executorBash = createBashTool(
    sandbox,
    createApproval({ mode: "delegated", trust: ["npm test", "npm run build", "npx tsc"] }),
  );
  const executor = new ToolLoopAgent({
    model: "anthropic/claude-sonnet-4-6",
    instructions: `You are an executor agent. Follow instructions precisely.
Working directory: ${sandbox.workingDirectory}
Do NOT ask questions. Do NOT explore beyond what's needed. Execute the task.`,
    tools: { read: parentTools.read, grep: parentTools.grep, bash: executorBash },
    stopWhen: stepCountIs(15),
  });
  try {
    const { text, steps } = await executor.generate({ prompt: description });
    return text ? `[Executor: ${steps.length} steps]\n${text}` : "(no response from executor)";
  } catch (e: any) {
    return `Executor error: ${e.message}`;
  }
}
```
Same `ToolLoopAgent` + `.generate({ prompt })` + `stepCountIs` surface as the explorer; the only structural differences are the tool set, model string, step budget, and the `createApproval({ mode, trust })` config feeding the executor's own `bash` tool instance.

**Applies to numa:**
- Maps directly onto the planned gameplay/visuals/audio specialist workers: each is an Executor — write-capable (`write_file`, `replace_text`, `delete_file`), stronger/mid-tier model, precise task instructions with file ownership, no `ask_player` access (that stays orchestrator-only, exactly like this lesson's "cannot ask user").
- The "instruction quality matters more for the executor" guidance is the strongest practical lever numa's tasks-phase has: task descriptions handed to specialist workers need the same goal/procedure/constraints/verification-step shape as the "Good" example, not a vague "fix the physics."
- The delegated-trust `bash` pattern doesn't map 1:1 (numa's tools are file-CRUD, not shell), but the underlying idea — give specialists only the operations the orchestrator has pre-approved, not a blanket capability set — matches gentle-ai's per-file edit authority model already used as a reference.
- Not applicable as-is: numa specialists likely won't need `bash` at all today (no shell tool in the current toolset), so the "own delegated-mode bash instance" concern doesn't transfer directly — but the "don't reuse the parent's interactive-mode tool for a subagent that can't answer prompts" principle would transfer if/when a shell tool is ever added.

## Task Tool
**Core idea:** Treat `task` as an explicit routing layer, not a grab-bag `execute` function: the tool picks the right subagent role, and each role is built by its own small helper, so adding a third role later is one new branch rather than a redesign.

**Key points:**
- Exercise requirements: tighten the tool's description so the parent knows when to pick which role (and points at `askUser`/direct work for non-delegation cases); make `execute` a thin router; each role built by a separate helper function taking `(sandbox, parentTools)` and returning a `ToolLoopAgent`, with model and step budget declared at the top of its own definition; keep error handling as string returns.
- Shared `runSubagent(role, agent, description)` helper factors out the try/catch + `[Role: N steps]` formatting so it lives in one place instead of being duplicated per branch.
- "Don't over-abstract" guidance: two helpers (`buildExplorer`, `buildExecutor`) + a router is enough at two roles; a registry-and-factory system is the right move at five roles, not two.
- Model-per-role table, explicitly stated as "model is part of the role definition, not a global setting":
  | Role | Model | Why |
  |---|---|---|
  | Explorer | Haiku | Fast, cheap, read-only |
  | Executor | Sonnet | Reliable for implementation |
  | Reviewer (later) | Opus | Heavy reasoning for code review |
  | Orchestrator (later) | Sonnet | Multi-tool routing |
  Don't pick one model for everything — cost difference compounds across a long task, and the failure modes differ by role too.
- Spawn-permissions sketch (documented but *not* enforced in the working harness at this point, because "the parent doesn't have a role yet"):
  ```ts
  const SPAWN_PERMISSIONS: Record<string, string[]> = {
    orchestrator: ["explorer", "executor", "reviewer"],
    executor: ["explorer"],
    explorer: [],
  };
  function canSpawn(parentRole: string, subagentType: string): boolean {
    return SPAWN_PERMISSIONS[parentRole]?.includes(subagentType) ?? false;
  }
  ```
  The check belongs at the top of `execute`; if not permitted, return an error string and skip building the subagent. Called out as "the next thing you'll want" once subagents themselves start calling `task` (i.e., nested delegation).
- Exercise idea (not built): a `reviewer` role — read-only tools, Opus-level model, plus a `verdict` tool returning `pass`/`fail` with feedback; auto-spawn a reviewer after an executor finishes, passing it the original task and the executor's diff; on `fail`, re-run the executor with feedback appended, capped at two retries. Open questions posed: which model combination gives the best review quality, and when does the reviewer start rubber-stamping instead of catching real problems.

**Code patterns:**
```ts
function buildExplorer(sandbox: Sandbox, parentTools: { read: any; grep: any }) {
  return new ToolLoopAgent({
    model: "anthropic/claude-haiku-4-5",
    instructions: `You are an explorer agent. Investigate and report back concisely.
Working directory: ${sandbox.workingDirectory}`,
    tools: { read: parentTools.read, grep: parentTools.grep },
    stopWhen: stepCountIs(5),
  });
}

function buildExecutor(sandbox: Sandbox, parentTools: { read: any; grep: any }) {
  const executorBash = createBashTool(sandbox, createApproval({
    mode: "delegated",
    trust: ["npm test", "npm run build", "npx tsc"],
  }));
  return new ToolLoopAgent({
    model: "anthropic/claude-sonnet-4-6",
    instructions: `You are an executor agent. Follow instructions precisely.
Working directory: ${sandbox.workingDirectory}
Do NOT ask questions. Do NOT explore beyond what's needed. Execute the task.`,
    tools: { read: parentTools.read, grep: parentTools.grep, bash: executorBash },
    stopWhen: stepCountIs(15),
  });
}

async function runSubagent(role: string, agent: ToolLoopAgent, description: string) {
  try {
    const { text, steps } = await agent.generate({ prompt: description });
    return text ? `[${role}: ${steps.length} steps]\n${text}` : `(no response from ${role})`;
  } catch (e: any) {
    return `${role} error: ${e.message}`;
  }
}

export function createTaskTool(sandbox: Sandbox, parentTools: { read: any; grep: any }) {
  return tool({
    description: `Delegate work to a subagent.
Explorer (default): read-only research with Haiku. Use for searching across files, understanding patterns, and gathering context.
Executor: implementation with Sonnet and delegated bash. Use for focused changes with explicit instructions and a known verification step.

WHEN TO USE: research across many files (explorer), bulk implementation (executor).
WHEN NOT TO USE: ambiguous requirements (use askUser), architectural decisions (the parent decides).
DO NOT USE FOR: single-step tasks the parent can do directly.`,
    inputSchema: z.object({
      description: z.string().describe("Task instructions for the subagent"),
      subagentType: z.enum(["explorer", "executor"]).default("explorer").describe("Subagent role"),
    }),
    execute: async ({ description, subagentType }) => {
      const agent = subagentType === "executor" ? buildExecutor(sandbox, parentTools) : buildExplorer(sandbox, parentTools);
      return runSubagent(subagentType, agent, description);
    },
  });
}
```

**Applies to numa:**
- The router-plus-helpers shape is the right template for numa's `task` tool once it grows beyond one specialist type: one thin `execute` dispatching on a `subagentType`/`phase` field, one `buildX` helper per specialist (gameplay/visuals/audio/verify), and a shared `runSubagent`-style formatter.
- The "model is part of the role definition" table is a direct precedent for numa's strong/mid/cheap tiering plan — pin the tier per phase (understand=cheap/mid, design=strong, tasks=mid, specialist execution=mid, verify=mid/strong) rather than a single session-wide model choice.
- Spawn-permissions sketch is relevant once numa's specialists could themselves call `task` (e.g., a gameplay worker wanting to delegate a sub-search) — until then it's correctly out of scope, matching gentle-ai's stricter rule that executors never delegate at all (numa may want to adopt that stricter rule rather than the permissions-map version).
- The reviewer-role exercise (OpUs judge + pass/fail + bounded retry) is a close preview of the "verify" phase in numa's target design and of the gate-after-each-phase-with-one-retry pattern already used by gentle-ai — worth treating as the concrete shape for numa's verify step rather than inventing one from scratch.

## Module takeaways for numa
1. **Role = tools + model + step budget, decided by the parent, never by the subagent.** This is the single clearest transferable rule: numa's orchestrator should hard-code capability and model per phase (explorer-like understand/design vs. executor-like specialist workers vs. reviewer-like verify), not let a subagent pick its own scope.
2. **Executors never ask the user; that channel stays exclusively with the parent.** Directly confirms numa's existing design where only the orchestrator's main loop owns `ask_player` — specialist workers should be built with an explicit "do NOT ask questions" instruction and no `ask_player` tool at all.
3. **Errors from a subagent call return as strings, never throw.** Numa's `toModelOutput` envelope should follow the same contract — a failed specialist run becomes a compact error string/envelope field, not an unhandled exception that kills the orchestrator's turn.
4. **Task descriptions handed to write-capable workers need goal + procedure + constraints + verification step**, not a one-line ask — this is the practical lever for numa's tasks-phase (with file ownership) output quality.
5. **Two roles is the right starting point; don't build a five-role hierarchy speculatively.** numa's plan already has three-plus specialist types, which is reasonable given the domain (distinct file/asset ownership per specialist), but the lesson's warning against speculative roles argues for keeping verify/review as a single role for now rather than splitting further.
6. **True parallelism is `Promise.all` over multiple subagent calls in one parent tool-loop step**, not multiple sequential delegations — matches numa's requirement to run gameplay/visuals/audio workers in parallel, and confirms that summing each subagent's token usage into the parent's turn usage (for numa's credit ledger) has to happen after that `Promise.all` resolves, per call, before the parent's own usage is finalized.
