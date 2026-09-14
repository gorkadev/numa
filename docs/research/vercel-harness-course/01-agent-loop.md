# Module 1 — The Agent Loop
Source lessons:
- "From Chat to Agent" — https://vercel.com/academy/build-ai-agent-harness/from-chat-to-agent
- "Your First Tools" — https://vercel.com/academy/build-ai-agent-harness/your-first-tools
- "Completing the Toolbox" — https://vercel.com/academy/build-ai-agent-harness/completing-the-toolbox

## From Chat to Agent
**Core idea:** A model with zero tools is a chatbot: it pattern-matches on what an answer "usually looks like" and returns one step of confident, fictional narration. Adding a single real tool (`read`) is what turns it into an agent that actually inspects the world before answering.

**Key points:**
- `ToolLoopAgent` with `tools: {}` and a task prompt returns after exactly 1 step — no tool calls, pure hallucination dressed as helpfulness.
- AI SDK naming to get right (course explicitly calls out v6 naming, i.e. **version-specific**): use `instructions` (not `system`), `stopWhen` (not `stopCondition`), and `agent.generate({ prompt })` (not `agent.generate(prompt)`). Wrong names silently compile but change behavior.
- A tool's `description` field is a prompt to the model, not a docstring for humans — the model reads it to decide whether to call the tool at all.
- Resolve all file paths against a fixed working directory (`resolve(cwd, filePath)`) so the agent can't read outside the project.
- Cap tool output defensively from lesson 1: `read` truncates at **500 lines** and prefixes each line with its line number. Rationale: an unbounded read on a 10,000-line file can eat ~10% of context in one call, and that result stays in context for the rest of the session. This context-management discipline is introduced here and applied to every tool afterward.

**Code patterns:**
```ts
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";

const agent = new ToolLoopAgent({
  model: "anthropic/claude-haiku-4-5",
  instructions: `You are a coding agent.\nWorking directory: ${cwd}`,
  tools: { read },
  stopWhen: stepCountIs(10),
});

const { text, steps } = await agent.generate({ prompt });
```
```ts
const read = tool({
  description: `Read a file from the project. Returns numbered lines.
WHEN TO USE: viewing file contents, checking configs, reading source code.
WHEN NOT TO USE: searching across files (use grep instead).`,
  inputSchema: z.object({
    path: z.string().describe("File path relative to working directory"),
    offset: z.number().optional().describe("Start line (1-indexed)"),
    limit: z.number().optional().describe("Max lines to return"),
  }),
  execute: async ({ path: filePath, offset, limit }) => { /* slice + cap at 500 lines */ },
});
```
Version-specific APIs used: `ToolLoopAgent`, `stepCountIs`, `tool()` all imported from `"ai"` (AI SDK). `z` from `"zod"`.

**Applies to numa:**
- numa already runs a `ToolLoopAgent`-equivalent (`streamText` loop) with `stopWhen: stepCountIs(25)` — same v7/v6 naming family; worth double-checking `instructions` vs `system` usage matches the installed AI SDK v7 API when doing the multi-agent refactor.
- The 500-line/output-cap discipline directly applies: numa's `read_file` tool should verify it caps output the same way, since sandbox files (generated game code) can be large and blow the per-turn token budget.
- "Description is a prompt, not a docstring" applies as-is to `read_file`, `list_files`, `write_file`, `replace_text`, `delete_file`, `ask_player` — worth auditing each for WHEN TO USE framing once Module 2 notes are in hand.
- Path resolution against a fixed root maps directly to numa's Daytona sandbox root — already sandboxed, so the containment concern is structurally handled by the sandbox boundary rather than `resolve()`, but the same principle (never trust a raw path) still applies inside the sandbox's own filesystem tools.

## Your First Tools
**Core idea:** Once there is more than one tool, the model must *choose* between them every step, and a thin description makes it choose wrong — it defaults to the most general tool it has (usually `bash`) rather than the correct specialized one.

**Key points:**
- A two-word description (`"Search files."`) causes the model to ignore `grep` entirely and either flail with `read` (opening random files hoping for a match) or reach for `bash`.
- The fix is a **four-section description contract**: WHEN TO USE, WHEN NOT TO USE, DO NOT USE FOR, EXAMPLES. This is the first appearance of the contract that Module 2 formalizes to five sections.
- `grep` implementation: `execSync` with `grep -rn --exclude-dir=node_modules --exclude-dir=.git --include='<glob>' -E '<pattern>'`, quoting inputs into the shell command to avoid breaking on special characters.
- Treat `grep`'s non-zero exit (no matches) as a **success** case, not an error — a naive try/catch would otherwise report a false failure.
- Cap at **50 matches**, reporting the total count when truncated — same context-discipline pattern as `read`'s 500-line cap, tuned lower because raw grep output is denser/noisier.
- WHEN NOT TO USE and DO NOT USE FOR must be written on *every* tool, not just the new one — `read`'s description also needs updating to push back against `grep`, or routing breaks in the other direction.

**Code patterns:**
```ts
const grep = tool({
  description: `Search file contents using regex. Returns matching lines with file paths.
WHEN TO USE: finding patterns across multiple files, locating function definitions,
  searching for imports, finding TODOs or error messages.
WHEN NOT TO USE: reading a known file (use read instead).
DO NOT USE FOR: running commands, listing directories.
EXAMPLES:
  - Find all TODO comments: pattern "TODO" glob "*.ts"`,
  inputSchema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().optional().describe("Directory to search (default: working dir)"),
    glob: z.string().optional().describe("File glob filter, e.g. '*.ts'"),
  }),
  execute: async ({ pattern, path: searchPath, glob: globFilter }) => {
    // execSync(`grep -rn --exclude-dir=node_modules --exclude-dir=.git --include='${glob}' -E '${pattern}' '${dir}'`)
    // catch: non-zero exit with no stdout → "No matches found."
  },
});
```

**Applies to numa:**
- numa has no `grep`/search tool today — only `read_file`, `list_files`, `write_file`, `replace_text`, `delete_file`. If the multi-agent harness adds an explorer/gameplay-specialist role that needs to search across generated game files, this four-section contract (and the 50-match cap) is the template to copy.
- The "bash gravity" framing (model defaults to the most general tool) is relevant even without a `bash` tool in numa: it explains why `write_file`/`replace_text` need equally explicit WHEN NOT TO USE boundaries against each other (e.g., replace_text vs. write_file for a full rewrite).
- Treating a tool's "empty result" as success-not-error is directly relevant to `list_files` on an empty/new sandbox directory.

## Completing the Toolbox
**Core idea:** `bash` is the most useful and most dangerous tool an agent can get; the AI SDK's `needsApproval` field looks like a safety gate but silently discards the tool call and lets the model hallucinate success, so real safety has to live inside `execute` itself (until a proper approval flow exists).

**Key points:**
- **Critical AI SDK gotcha:** `needsApproval: () => true` without a wired-up approval handler causes the SDK to emit a `tool-approval-request` and skip `execute`. The model gets no result back, so it fabricates one ("Done! I deleted the files.") — the user sees a false success message while nothing ran. `needsApproval` is described as "a signal, not a gate": the harness must build the surrounding flow or blocked tools vanish silently.
- Given that gotcha, Module 1's `bash` gates safety **inside `execute`** via a `SAFE_PREFIXES` allowlist (`ls`, `cat`, `echo`, `pwd`, `which`, `find`, `head`, `tail`, `wc`, `git log`, `git status`, `git diff`) so the model always gets a real string back — including an honest block message it can relay to the user.
- Matching is by **prefix**, not exact string (`ls -la` must match `ls`).
- `execSync` needs a `timeout` (30s in the example) so a hung process doesn't freeze the whole agent loop.
- Known gap called out explicitly: prefix matching catches `rm` but not a rewrite like `find . -name node_modules -exec rm -rf {} +`. The lesson recommends regex patterns for dangerous commands in production, keeping the prefix check here only because it's pedagogically clear, not complete.
- Proper interactive approval flow is deferred to Module 2 (approval gates) — this lesson only builds the blunt block-at-execute version.

**Code patterns:**
```ts
const SAFE_PREFIXES = ["ls", "cat", "echo", "pwd", "which", "find", "head", "tail", "wc", "git log", "git status", "git diff"];

function isSafe(command: string): boolean {
  return SAFE_PREFIXES.some((p) => command.trim().startsWith(p));
}

const bash = tool({
  description: `Execute a shell command in the working directory. ...`,
  inputSchema: z.object({ command: z.string().describe("Shell command to execute") }),
  execute: async ({ command }) => {
    if (!isSafe(command)) {
      return `Blocked: "${command}" requires approval. Only safe commands (${SAFE_PREFIXES.join(", ")}) run automatically.`;
    }
    try {
      const stdout = execSync(command, { cwd, encoding: "utf-8", timeout: 30_000 });
      return stdout || "(no output)";
    } catch (e: any) {
      return `Exit ${e.status ?? 1}: ${e.stdout || e.stderr || e.message || ""}`;
    }
  },
});
```
The anti-pattern to avoid (do not copy): `needsApproval: () => true` with no handler wired up.

**Applies to numa:**
- numa has **no `bash`/execute tool** by design — the toolset is read_file/list_files/write_file/replace_text/delete_file/ask_player, all filesystem-shaped, no arbitrary shell execution surfaced to the model. The `needsApproval` pitfall is still worth knowing if numa ever adds an execute-in-sandbox tool (e.g., "run the game's build/typecheck inside Daytona"), since Trigger.dev's human-in-the-loop primitives could tempt a similar silent-vanish bug.
- `ask_player` is already numa's human-in-the-loop tool but is explicitly no-execute (a questionnaire) — the course's "block message returned as a real tool result, not a swallowed approval request" pattern is the right mental model for how `ask_player` should behave when it needs an answer before proceeding.
- If numa's orchestrator ever adds a sandboxed command-execution tool for verification (e.g., running the game's dev server or a lint step inside Daytona), the execute-level allowlist + honest block-message pattern (not `needsApproval`) is the directly transferable design.
- Not applicable: local-machine `execSync` and its `SAFE_PREFIXES` — numa's execution surface, if any, would run inside the Daytona sandbox rather than the harness's own host, so the specific allowlist commands (`git status`, `cat`, etc.) don't map 1:1 to a browser-game codebase, though the pattern (prefix-allowlist gate returning honest strings) would still apply to a sandbox-scoped exec tool.

## Module takeaways for numa
1. Tool `description` is the model-selection API — every numa tool (`read_file`, `write_file`, `replace_text`, `delete_file`, `ask_player`) should be audited against the WHEN TO USE / WHEN NOT TO USE / DO NOT USE FOR contract, especially as the toolset grows with specialist subagents that get narrower tool subsets.
2. Never rely on `needsApproval` alone for anything that must not silently no-op — this is a real AI SDK trap and numa should confirm `ask_player` and any future gated tool return an honest, always-present tool result rather than a request that can vanish unhandled.
3. Output caps (500-line read, 50-match grep) are the load-bearing context-management primitive — numa's `read_file` should be checked/confirmed to truncate large generated files the same way, since this directly affects the per-turn token-cost ledger.
4. "Treat empty/non-matching results as success, not error" avoids false-failure noise that would otherwise pollute the agent's context and confuse the cost-ledger's turn accounting.
5. The prefix-allowlist + execute-level gate pattern (safe by default, honest block message otherwise) is the template to reuse if numa's harness evolution ever adds a sandbox command-execution or verification tool.
