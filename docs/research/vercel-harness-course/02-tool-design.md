# Module 2 — Tool Design
Source lessons:
- "Descriptions That Work" — https://vercel.com/academy/build-ai-agent-harness/descriptions-that-work
- "Shell Execution with Safety" — https://vercel.com/academy/build-ai-agent-harness/shell-execution-with-safety
- "Approval Gates" — https://vercel.com/academy/build-ai-agent-harness/approval-gates

## Descriptions That Work
**Core idea:** The two-section description contract (WHEN TO USE / WHEN NOT TO USE) that worked for 3 tools stops working as the toolbox grows (subagents, edit, write, todo) — the fix is a fuller 5-section contract, and doubling the negative steering is deliberate, not redundant.

**Key points:**
- Full 5-section contract: **first line** (what it does + output format), **WHEN TO USE** (2-4 specific scenarios with keywords the model will see in real prompts), **WHEN NOT TO USE** (soft redirect, "prefer X"), **DO NOT USE FOR** (hard boundary, restated), **USAGE** (constraints the schema can't express: caps, defaults, encoding), **EXAMPLES** (2-3 concrete invocations to pattern-match against).
- "Bash gravity": every model tested (Haiku, Sonnet, Opus) defaults to the most general tool (`bash`) when descriptions are weak. This is named as a universal pull, not a Haiku-only quirk.
- Model-specific behavior observed: **Haiku** reads WHEN NOT TO USE but ignores it under ambiguity; **Sonnet** respects it but benefits from DO NOT USE FOR as reinforcement; **Opus** handles both well and the repetition does no harm. → the doubled negative is cheap insurance across a model tier spread.
- USAGE section earns its place specifically when a parameter has a constraint the model can't infer from the Zod schema alone (e.g., a numeric cap, a default value, an encoding rule).
- Tool descriptions live in the system prompt, which the SDK caches between turns — so a longer, more explicit description is a one-time token cost, not a per-turn one.
- Debugging technique recommended: strip sections one at a time (EXAMPLES → DO NOT USE FOR → WHEN NOT TO USE) and re-run fixed test prompts to find exactly which section is load-bearing for a given model.

**Code patterns:**
```ts
const grep = tool({
  description: `Search file contents using regex. Returns matching lines with file paths.

WHEN TO USE: finding patterns across multiple files, locating function definitions,
  searching for imports, finding TODOs or error messages.

WHEN NOT TO USE: reading a known file (use read instead).
  Running commands (use bash instead).

DO NOT USE FOR: reading files (use read), listing directories (use bash),
  modifying files (use edit).

USAGE: pattern is a regex string. glob filters by file extension.
  Results are capped at 50 matches.

EXAMPLES:
  - Find all TODO comments: pattern "TODO" glob "*.ts"
  - Find function definitions: pattern "function \\w+" glob "*.ts"`,
  // ... inputSchema and execute unchanged
});
```

**Applies to numa:**
- numa's chat agent already juggles 6 tools across 3 Gemini model tiers (3.1-pro-preview / 3.8-flash / 3.5-flash-lite) — the model-tier-specific robustness point (Haiku-equivalent needs the strongest doubled negative) is directly relevant: numa's cheapest-tier model is most likely to need the full 5-section contract, not just the pro tier.
- The multi-agent harness plan adds specialist subagents with narrower tool subsets (gameplay, visuals, audio) — each specialist's tool descriptions need their own WHEN NOT TO USE pointing at sibling tools, since ambiguity multiplies with more near-duplicate tools in play (e.g. `write_file` vs `replace_text` for a visuals worker only touching shaders).
- USAGE-section framing (schema can't express caps/defaults) is directly actionable for numa's `write_file`/`replace_text` — if there's any max-file-size or line-count behavior, it belongs in USAGE, not just in the Zod schema.
- Description cost being "paid once via prompt caching" reassures against over-trimming numa's engine-block (~250 lines) — verbosity there is a cache-amortized cost, so the fix for context bloat is scoping (Module 3 dynamic prompts / skills-on-demand), not shrinking wording.

## Shell Execution with Safety
**Core idea:** Extract the model-facing contract (description, schema, safety check) from the execution backend (`execSync`) via a factory + injected `operations` interface, so swapping local execution for a sandboxed one later is a one-line change, not a rewrite.

**Key points:**
- `BashOperations` interface: `exec(command: string): Promise<{ stdout: string; exitCode: number }>` — the seam between "what the model sees" and "what actually runs commands."
- `createBashTool(operations: BashOperations, safePrefixes: string[])` closes over `operations` and `safePrefixes`; `execute` calls `operations.exec(command)` instead of calling `execSync` directly — no `execSync`, no `cwd`, no Node `child_process` error-shape knowledge lives above the seam anymore.
- `localOps` is the concrete implementation: wraps `execSync`, normalizes both success and thrown-error paths into the same `{ stdout, exitCode }` shape.
- Explicit **refactor-when-there's-pressure** principle: the lesson deliberately does *not* apply the same factory pattern to `read` yet, because its backend doesn't vary until Module 4's sandbox abstraction. Premature abstraction is called out as something to avoid.
- Sketching exercise: a `mockOps: BashOperations` that fakes `{ stdout: "(pretend output)", exitCode: 0 }` for anything — demonstrates the seam is real by producing plausible-but-fake output when swapped in, previewing why a sandbox-backed `sandboxOps` slots in identically later.

**Code patterns:**
```ts
interface BashOperations {
  exec(command: string): Promise<{ stdout: string; exitCode: number }>;
}

function createBashTool(operations: BashOperations, safePrefixes: string[]) {
  function isSafe(command: string): boolean {
    return safePrefixes.some((p) => command.trim().startsWith(p));
  }
  return tool({
    description: `Execute a shell command in the working directory. ...`,
    inputSchema: z.object({ command: z.string().describe("Shell command to execute") }),
    execute: async ({ command }) => {
      if (!isSafe(command)) return `Blocked: "${command}" requires approval.`;
      const { stdout } = await operations.exec(command);
      return stdout || "(no output)";
    },
  });
}

const localOps: BashOperations = {
  exec: async (command) => {
    try {
      const stdout = execSync(command, { cwd, encoding: "utf-8", timeout: 30_000 });
      return { stdout, exitCode: 0 };
    } catch (e: any) {
      return { stdout: e.stdout || e.stderr || e.message || "", exitCode: e.status ?? 1 };
    }
  },
};

const bash = createBashTool(localOps, SAFE_PREFIXES);
```
Preview of the sandbox swap (Module 4, referenced here): `const sandboxOps: BashOperations = { exec: (command) => sandbox.exec(command) }; const bash = createBashTool(sandboxOps, SAFE_PREFIXES);` — same tool, different backend.

**Applies to numa:**
- This is close to how numa's tools should already be shaped, since numa's real backend *is* a Daytona sandbox, not local `execSync` — worth verifying `read_file`/`write_file`/etc. are implemented behind an `operations`-style interface (sandbox client calls) rather than tool `execute` bodies calling the Daytona SDK directly. If they're not factored this way yet, this is the concrete refactor target.
- The "don't abstract until there's pressure" principle argues against pre-emptively building a swappable-backend seam for every numa tool — only worth doing where a second backend genuinely exists or is imminent (e.g., if numa ever needs a local-dev-mode fallback next to the Daytona sandbox).
- Directly relevant to the orchestrator/subagent split: if specialist subagents (gameplay/visuals/audio) each get their own tool instances, having `createXTool(operations, config)` factories means the orchestrator can construct per-subagent tool sets from one shared operations client, varying only the approval/trust config per role (ties into the next lesson).

## Approval Gates
**Core idea:** Approval config evolves from a boolean → a function → a typed discriminated union (`interactive` / `background` / `delegated`) so the same gate can serve a human-in-the-loop terminal, an unattended CI run, and a subagent that inherits only a slice of its parent's trust — without rewriting the gate function each time.

**Key points:**
- Stage 1 (boolean `needsApproval: true`) blocks everything — useless but establishes the question the gate answers: "should we pause for human approval before this runs?"
- Stage 2 (function `({ command }) => boolean`) can differentiate by input but bakes in exactly one rule; CI gets the same gate as a human terminal, a subagent gets the same gate as its parent — no way to reconfigure without rewriting the function.
- Stage 3 (discriminated union) is the actual target shape:
  ```ts
  type ApprovalConfig =
    | { mode: "interactive" }
    | { mode: "background" }
    | { mode: "delegated"; trust: string[] };
  ```
  `createApproval(config)` returns a `needsApproval`-shaped function; `background` always returns `false` (auto-approved, for CI/automation); `delegated` approves only commands matching `config.trust`; `interactive` approves only the safe-prefix list (human approves everything else).
- Rationale for a discriminated union over three separate named functions: **the config is data, not code** — it can be loaded from `AGENTS.md`, validated with `z.discriminatedUnion("mode", [...])`, serialized across a subagent process/RPC boundary, and changed by users without touching harness code. TypeScript also narrows `config.trust` to `string[]` only inside the `delegated` branch — a compile-time safety net the boolean/function stages didn't have.
- `delegated` mode is called out as "the interesting one": a parent agent spawning a subagent doesn't hand over its full safe-prefix list, it hands over exactly the commands that subagent's job requires (e.g. a read-only explorer gets `pwd`/`find`/`git status`; a test-runner executor gets `npm test`/`npm run build`).
- Important operational distinction: **approval outcome ≠ command outcome**. A command can pass the approval gate and still fail for ordinary reasons (e.g. `npm test` is approved, then exits non-zero because tests fail) — keep these two failure modes separate when debugging.
- `createBashTool` signature changes to accept the approval function directly (`needsApproval: (input) => boolean`) instead of a raw `safePrefixes` array, continuing the factory-seam pattern from the previous lesson.

**Code patterns:**
```ts
type ApprovalConfig =
  | { mode: "interactive" }
  | { mode: "background" }
  | { mode: "delegated"; trust: string[] };

function createApproval(config: ApprovalConfig) {
  return ({ command }: { command: string }) => {
    if (config.mode === "background") return false;
    if (config.mode === "delegated") {
      return !config.trust.some((p) => command.trim().startsWith(p));
    }
    return !SAFE_PREFIXES.some((p) => command.trim().startsWith(p));
  };
}

function createBashTool(
  operations: BashOperations,
  needsApproval: (input: { command: string }) => boolean,
) {
  return tool({
    // ... same description and schema
    execute: async ({ command }) => {
      if (needsApproval({ command })) return `Blocked: "${command}" requires approval.`;
      const { stdout } = await operations.exec(command);
      return stdout || "(no output)";
    },
  });
}

// call sites
const bash = createBashTool(localOps, createApproval({ mode: "interactive" }));
const bash = createBashTool(localOps, createApproval({ mode: "background" }));
const bash = createBashTool(localOps, createApproval({ mode: "delegated", trust: ["pwd", "find .", "git status"] }));
```

**Applies to numa:**
- This is the most directly reusable pattern for numa's planned orchestrator → specialist-worker split: an `ApprovalConfig`-style discriminated union (`orchestrator` full trust / `specialist` scoped trust / `background` for fully automated small-tweak edits) maps cleanly onto "small tweak = direct edit" vs. "phased multi-worker" routing, letting the orchestrator hand each gameplay/visuals/audio worker a narrower trust slice of file-write scope rather than full sandbox access.
- `delegated` mode's "parent decides what to hand each subagent" is the concrete mechanism for isolating subagent context/permissions in the harness redesign — e.g. a visuals worker's trust could be scoped to shader/asset file globs, an audio worker to audio-asset paths, reducing blast radius per specialist.
- "Approval outcome vs. command outcome" is a useful debugging distinction to carry into numa's verify phase: a write being *allowed* is different from the resulting game code being *correct* — numa's verify step should keep these separate in its reporting, matching Module 3's verification-honesty lesson.
- Not directly applicable as shell commands: numa has no `bash` tool, so `SAFE_PREFIXES`-style command allowlisting doesn't map 1:1 — but the same discriminated-union shape applies naturally to file-operation scoping (allowed path globs / allowed tool names per subagent role) instead of allowed shell-command prefixes.

## Module takeaways for numa
1. The `ApprovalConfig` discriminated-union pattern (interactive/background/delegated) is the single most valuable transferable idea for the orchestrator-to-specialist-worker redesign — it's the natural shape for scoping what each subagent (gameplay/visuals/audio) is allowed to touch.
2. The 5-section description contract, with model-tier-aware doubled negatives, should be audited against numa's cheapest model tier (3.5-flash-lite) first, since that's the tier most likely to need the reinforcement Haiku needed in testing.
3. The `operations`-interface/factory seam (tool contract vs. execution backend) is worth confirming numa's tools already follow, since numa's backend is a Daytona sandbox client call, not local `execSync` — if any tool calls the Daytona SDK directly inside `execute`, that's the refactor target.
4. "Refactor when there's pressure, not before" is a useful check against over-engineering the harness split — only build swappable seams where a second backend or trust profile genuinely exists.
5. Keep "was this approved/allowed" separate from "did it produce a correct result" in any future verify-phase reporting — mirrors the approval-vs-outcome distinction and previews Module 3's verification-honesty contract.
