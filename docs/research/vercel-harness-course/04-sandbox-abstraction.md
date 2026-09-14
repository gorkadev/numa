# Module 4 — The Sandbox Abstraction
Source lessons:
- Designing the Interface — https://vercel.com/academy/build-ai-agent-harness/designing-the-interface
- Local Implementation — https://vercel.com/academy/build-ai-agent-harness/local-implementation
- In-Memory Implementation — https://vercel.com/academy/build-ai-agent-harness/in-memory-implementation
- Cloud Implementation — https://vercel.com/academy/build-ai-agent-harness/cloud-implementation
- Lifecycle Hooks — https://vercel.com/academy/build-ai-agent-harness/lifecycle-hooks

## Designing the Interface
**Core idea:** Tools should never call `readFileSync`/`execSync` (or any host-specific API) directly. Define one small `Sandbox` interface first; every tool calls through it, and execution backends slot in behind it without touching tool code.

**Key points:**
- The interface is deliberately minimal: `type`, `workingDirectory`, `readFile(path)`, `exec(command)`, `stop()`, plus **optional** `expiresAt` and `snapshot()`.
- Every method is `async`, even the ones that will be sync under the hood (local fs), because the cloud backend genuinely needs async and a mixed signature set is "a mess."
- `type` is a plain `string` (not a union) for logging/debugging; only promote it to a union (`"local" | "just-bash" | "cloud"`) later if needed.
- Optional methods (`expiresAt?`, `snapshot?`) exist so backends that can't support a capability don't need stub implementations — "the interface accommodates both without forcing stubs."
- Rule of thumb: "Make the interface as small as you can get away with. Anything you add now will be the thing every implementation has to support forever."
- The refactor is meant to be behavior-neutral: same tools, same prompts, same results before and after — that's the test that the change was structural, not behavioral. The payoff shows up later when a second backend is added without touching tool code.
- Exercise callout: adding a new capability (e.g. `writeFile`) forces a design choice every time — new optional method vs. separate write-capable interface vs. throwing from backends that can't support it — and each option has a different cost that ripples outward.

**Code patterns:**
```ts
// src/sandbox.ts
export interface Sandbox {
  type: string;
  workingDirectory: string;
  readFile(path: string): Promise<string>;
  exec(command: string): Promise<{ stdout: string; exitCode: number }>;
  stop(): Promise<void>;
  expiresAt?: number;
  snapshot?(): Promise<{ snapshotId: string }>;
}
```
Tool factories become functions that accept a `Sandbox` and close over it:
```ts
export function createReadTool(sandbox: Sandbox) {
  return tool({
    /* same description/inputSchema as before */
    execute: async ({ path: filePath, offset, limit }) => {
      const content = await sandbox.readFile(filePath);
      // ... same line numbering/truncation logic
    },
  });
}
```
`exec`-based tools (`bash`, `grep`) route through `sandbox.exec(command)` instead of `execSync`/a hand-rolled `localOps` object.

**Applies to numa:**
- numa already has this shape in spirit (games run in Daytona via tool calls), but check whether the tool implementations (`read_file`, `write_file`, `replace_text`, `delete_file`, `list_files`) call a Daytona SDK client directly inline, or go through a small internal `Sandbox`-like interface. If it's the former, this lesson is the argument for introducing that seam — it's what lets a future verifier (headless game runner) or a local/dev sandbox substitute for Daytona in tests without touching tool code.
- The optional `expiresAt`/`snapshot` fields map directly onto Daytona's own sandbox lifecycle (sandboxes expire; Daytona supports snapshots) — worth mirroring if numa doesn't already expose these to the orchestrator.
- For a multi-agent harness, a shared `Sandbox` interface is what lets specialist subagents (writers, verifier) all operate against the *same* game sandbox via the *same* narrow contract, rather than each subagent re-implementing Daytona calls.

## Local Implementation
**Core idea:** Ship the boring backend first — a local sandbox that just wraps `readFileSync`/`execSync` behind the interface — to prove the interface works before adding real complexity (in-memory FS, cloud VMs).

**Key points:**
- `createLocalSandbox(dir)` is small on purpose: "around 15 lines... If yours is longer, you're probably handling cases the cloud backend will care about and the local one doesn't."
- `exec` must **never throw**, even on non-zero exit — catch the error and return `{ stdout, exitCode }` so tools always get a consistent result shape instead of having to catch exceptions themselves.
- `exec` uses a 30-second timeout (`timeout: 30_000`) and runs with `cwd: dir`.
- `stop()` is `async () => {}` — a legitimate no-op is fine when there's nothing to clean up.
- Regression test for the refactor: agent behavior on identical prompts must be byte-identical to the pre-interface version. Any behavior change signals a tool still reaching for a Node API directly.
- Exercise callout: swapping `execSync` (buffers everything, blocks until done) for `spawn` + streaming would require changing the `Sandbox.exec` return shape (single `{stdout, exitCode}` → async iterator), which "ripples back into every tool that calls `exec`" — a concrete illustration that interface decisions are sticky/expensive to change later.

**Code patterns:**
```ts
// src/sandbox-local.ts
export function createLocalSandbox(dir: string): Sandbox {
  return {
    type: "local",
    workingDirectory: dir,
    readFile: async (p) => readFileSync(resolve(dir, p), "utf-8"),
    exec: async (command) => {
      try {
        const stdout = execSync(command, { cwd: dir, encoding: "utf-8", timeout: 30_000 });
        return { stdout, exitCode: 0 };
      } catch (e: any) {
        return { stdout: e.stdout || e.stderr || e.message || "", exitCode: e.status ?? 1 };
      }
    },
    stop: async () => {},
  };
}
```

**Applies to numa:**
- numa's production path is cloud-only (Daytona), but a `createLocalSandbox`-equivalent (or an existing local test harness) is valuable for fast iteration on tool logic and prompt engineering without spinning up a Daytona sandbox per test.
- The "never throw from exec, return exitCode instead" rule is directly applicable to numa's tool `execute` functions — worth auditing whether Daytona command failures currently propagate as thrown exceptions into the agent loop (which would look like a tool error rather than actionable tool output).

## In-Memory Implementation
**Core idea:** A copy-on-write in-memory backend (`just-bash`) lets an agent explore/write freely with zero risk to the real filesystem — reads come from real disk, writes live only in memory and vanish when the sandbox stops.

**Key points:**
- `createJustBashSandbox(dir): Promise<Sandbox>` is async because `JustBashSandbox.create({ overlayRoot: dir })` itself returns a promise — unlike the sync local factory.
- **Mount-point trap:** `overlayRoot: "/path/to/project"` does **not** mount at `/` or at the original path — it mounts at the fixed virtual path `/home/user/project`. Every `readFile`/`runCommand` call must prefix paths with that `MOUNT` constant. Called out twice as something that "trips everyone up."
- `just-bash` command API is handle-based, not result-based: `runCommand()` returns a handle; call `.wait()` for the exit code and `.output()` for combined stdout/stderr — a different pattern from `execSync`'s single return value.
- Backend selection is a simple env-var switch (`process.env.SANDBOX`), with the async/sync mismatch between backends handled by a ternary at the call site — everything downstream (tools, agent, prompt builder) stays identical.
- Portability is not automatic: some tools (the lesson calls out `grep` specifically) can quietly behave differently because `just-bash`'s simulated shell isn't byte-identical to the real system. This is presented as an expected, real cost of adding a second backend, not a theoretical edge case.
- Copy-on-write in one sentence (verbatim framing from the lesson): reads come from real disk, writes go to memory, the real filesystem is never modified, and the virtual FS is garbage-collected when the sandbox stops.

**Code patterns:**
```ts
import { Sandbox as JustBashSandbox } from "just-bash";
const MOUNT = "/home/user/project";

export async function createJustBashSandbox(dir: string): Promise<Sandbox> {
  const jb = await JustBashSandbox.create({ overlayRoot: dir });
  return {
    type: "just-bash",
    workingDirectory: dir,
    readFile: async (p) => jb.readFile(`${MOUNT}/${p}`),
    exec: async (command) => {
      const cmd = await jb.runCommand(command, { cwd: MOUNT });
      const finished = await cmd.wait();
      return { stdout: await cmd.output(), exitCode: finished.exitCode };
    },
    stop: async () => {},
  };
}
```
Backend switch:
```ts
const sandboxType = process.env.SANDBOX || "local";
const sandbox = sandboxType === "just-bash" ? await createJustBashSandbox(cwd) : createLocalSandbox(cwd);
```

**Applies to numa:**
- Not directly applicable to numa's production path (numa always uses Daytona, a real cloud sandbox, not an in-memory overlay) — but the *pattern* is relevant if numa ever wants a cheap, zero-network-cost "dry run" mode for a verifier or exploratory subagent that shouldn't be allowed to mutate `/home/daytona/game` for real until a plan is confirmed.
- The mount-point-trap lesson generalizes directly: numa's own fixed path convention (`/home/daytona/game`) is exactly this kind of constant that every tool must consistently prefix/resolve against — worth double-checking all tool implementations derive paths from one shared constant rather than hardcoding the prefix in multiple places.

## Cloud Implementation
**Core idea:** A cloud sandbox (real VM, real network, real cost) implements the exact same `Sandbox` interface as the local/in-memory backends — the shape doesn't change, only the tradeoffs (latency, cost, isolation, expiry) do. This lesson is concept/analysis, not build-along, because provider-specific provisioning APIs churn too fast for a course to track.

**Key points:**
- Tradeoff table given by the lesson:
  | | Local | just-bash | Cloud |
  |---|---|---|---|
  | Cost | Free | Free | Per-minute |
  | Latency | Microseconds | Microseconds | Tens–hundreds of ms per call |
  | Isolation | None | Partial (reads real, writes virtual) | Full, separate VM |
  | Persistence | Permanent | GC'd on stop | Snapshot or restore |
  | git/npm | Local install | Simulated | Real, separately installed |
  | Timeout | None | None | Hard limit, "often 30 to 60 minutes" |
- Use-case mapping: `local` → local dev/debugging/trusted environments; `just-bash` → exploration/testing/untrusted code review; `cloud` → production/CI/multi-user/fully sandboxed execution.
- `expiresAt` exists so a long-running task can check the clock and decide whether to start a new operation or wrap up, instead of discovering the timeout via a network error.
- `snapshot` exists to let the harness save state before the VM dies (e.g. snapshot at minute 28 of a 30-minute VM, restart from the snapshot in a fresh sandbox) — cross-referenced to "Module 7" for deep coverage (not part of this course's provided lesson set).
- Explicitly optional fields exist so simpler backends aren't forced to fake capabilities they don't have.
- Exercise/thought experiment: design a cost-guardrail in the harness (the agent itself doesn't see cost, but the harness wrapping it can) that warns when running cost crosses a threshold, and decide whether crossing it should stop, snapshot, or ask the user — each choice implies a different operational model.

**Code patterns:**
```ts
// illustrative only — no live provider wired up in the course
export async function createCloudSandbox(config: { template?: string; snapshotId?: string }): Promise<Sandbox> {
  const vm = await VercelSandbox.create(config);
  return {
    type: "cloud",
    workingDirectory: "/workspace",
    expiresAt: Date.now() + 30 * 60 * 1000,
    readFile: async (p) => vm.files.read(resolve("/workspace", p)),
    exec: async (command) => {
      const result = await vm.commands.run(command, { cwd: "/workspace" });
      return { stdout: result.stdout + result.stderr, exitCode: result.exitCode };
    },
    stop: async () => { await vm.close(); },
    snapshot: async () => { const snap = await vm.snapshot(); return { snapshotId: snap.id }; },
  };
}
```

**Applies to numa:**
- This is exactly numa's production shape — Daytona is the "cloud" backend. The `expiresAt` concept maps directly: numa's per-turn Trigger.dev loop should be checking Daytona sandbox expiry and deciding whether to extend/recreate before a long agentic run (e.g. a 25-step multi-agent phase) gets cut off mid-task by sandbox expiry rather than by `stepCountIs(25)`.
- `snapshot`/restore maps to whether numa persists or recreates the Daytona sandbox across turns of the same chat session — worth confirming whether numa currently recreates the sandbox each turn (wasteful, re-uploads files) or keeps one long-lived sandbox per game session with snapshot/restore around Trigger.dev's own durability (checkpoint/resume) already used for the `chat.agent` run.
- The suggested cost-aware guardrail (warn/stop/snapshot/ask-user when cost crosses a threshold) maps onto numa's existing per-turn token cost ledger converted to credits — the harness-level (not agent-level) placement of that check is a concrete design precedent for where the orchestrator should enforce a credit budget across a multi-agent phase.

## Lifecycle Hooks
**Core idea:** Sandbox creation is only half the setup; `afterStart`/`beforeStop`/`onTimeout` hook points let the harness configure a fresh environment (git identity, deps, env files) and safely persist state before a sandbox disappears — cheap ceremony for local, essential for cloud.

**Key points:**
- `SandboxLifecycle` has three **all-optional** methods, each `(sandbox: Sandbox) => Promise<void>`: `afterStart`, `beforeStop`, `onTimeout`. But the *lifecycle object itself* should not be optional at the call site — default it to `{}`, don't make the wiring conditional.
- `afterStart` runs once, right after the sandbox is ready — typical body: `git config user.name/email`, `npm install`, `cp .env.example .env`.
- `beforeStop` runs before shutdown — typical body: check `git status --porcelain`, auto-commit uncommitted work ("WIP: auto-save"), then call `sandbox.snapshot?.()` if available.
- `onTimeout` is invoked **by the backend itself** (e.g. cloud sandbox reaching `expiresAt`), not called by harness code directly — its body usually reuses `beforeStop` plus logging. Stubbed in this lesson, used for real in Module 7.
- Critical wiring detail: `beforeStop` and `sandbox.stop()` must run inside a `finally` block around the agent's `generate()` call, so uncommitted-work checks fire even if the agent throws mid-run.
- Optional chaining (`lifecycle.afterStart?.(sandbox)`) replaces manual `if (lifecycle.afterStart)` guards — the idiomatic way to make hook calls conditional without branching.
- Framing: "the local case is the simpler shape of the cloud case, not a different shape" — the interface forces you to think about setup/teardown for *both* even though local doesn't strictly need it.
- Exercise: pairing `afterStart` (restore from a saved snapshot if one exists) with `beforeStop` (auto-snapshot) gives "crash-resume behavior with no extra code at the call site" — flagged as deferred to Module 7 (not in the provided lesson set) with open questions: where does the snapshot live, how do you distinguish a new run from a resumed one, what happens when the snapshot is from a different code version.

**Code patterns:**
```ts
// src/sandbox.ts (additions)
export interface SandboxLifecycle {
  afterStart?(sandbox: Sandbox): Promise<void>;
  beforeStop?(sandbox: Sandbox): Promise<void>;
  onTimeout?(sandbox: Sandbox): Promise<void>;
}
```
```ts
// index.ts
const sandbox = await createSandboxByEnv(cwd);
const lifecycle: SandboxLifecycle = {};

await lifecycle.afterStart?.(sandbox);
try {
  const { text, steps } = await agent.generate({ prompt });
  console.log(text);
} finally {
  await lifecycle.beforeStop?.(sandbox);
  await sandbox.stop();
}
```
Illustrative cloud lifecycle body:
```ts
const cloudLifecycle: SandboxLifecycle = {
  afterStart: async (sandbox) => {
    await sandbox.exec('git config user.name "Agent"');
    await sandbox.exec("npm install");
    await sandbox.exec("cp .env.example .env");
  },
  beforeStop: async (sandbox) => {
    const { stdout } = await sandbox.exec("git status --porcelain");
    if (stdout.trim()) await sandbox.exec('git add -A && git commit -m "WIP: auto-save"');
    if (sandbox.snapshot) await sandbox.snapshot();
  },
};
```

**Applies to numa:**
- Directly applicable: numa's `afterStart` equivalent is "create Daytona sandbox, upload game toolkit + starter files to `/home/daytona/game`, start the static server on port 3000" — worth confirming that step is wrapped as an explicit, named hook rather than inlined ad hoc at sandbox-creation time, especially once a verifier subagent needs the *same* setup guarantee before it runs the game headless.
- `beforeStop`'s "commit/persist before losing state" pattern maps to whatever numa does with in-sandbox file state between turns — if the sandbox is recreated per turn (see cloud-implementation note above), a `beforeStop` that flushes any pending game files back to Postgres/S3-equivalent storage would prevent silent loss of agent work if a turn errors mid-run.
- `onTimeout` is worth wiring explicitly if Daytona sandboxes expire mid-multi-agent-phase (e.g. during a long "phases: understand → design → tasks → parallel workers → verify" run) — right now the `finally` block plus Trigger.dev's own durability may partially cover this, but an explicit `onTimeout` hook gives a clean place to snapshot/log before the harness has to recreate the sandbox and re-upload files.

## Module takeaways for numa
1. **Formalize the Sandbox seam.** If numa's tools call the Daytona client directly rather than through a narrow interface (`readFile`/`exec`/`writeFile`/`stop`/`expiresAt`/`snapshot`), introducing that seam is the single highest-leverage change from this module — it's the precondition for a verifier subagent, a cheap local/dry-run backend for tests, and multiple specialist subagents sharing one sandbox contract safely.
2. **`exec` (and tool execute()) should never throw for expected failures.** Catch and return `{ stdout, exitCode }` (or numa's equivalent) so the agent loop sees a structured result it can react to, not an exception that looks like harness failure.
3. **Treat `expiresAt` as a first-class signal, not an afterthought.** With a 25-step budget and a multi-agent phase workflow planned, a long-running Daytona sandbox hitting its expiry mid-phase is a real failure mode this module names explicitly (`onTimeout`) — worth an explicit check/hook rather than discovering it via a network error.
4. **Lifecycle hooks (`afterStart`/`beforeStop`) are the right place for setup/teardown ceremony**, especially once a verifier needs guaranteed environment setup before running the game headless, and once multi-turn/multi-agent runs need to guard against losing in-sandbox state if a turn or subagent errors.
5. **Cost-awareness belongs in the harness, not the model.** The suggested cost-guardrail placement (warn/stop/snapshot at the harness level around a per-minute-billed sandbox) is a direct precedent for enforcing numa's credit budget across a multi-agent phase where subagent token usage sums into the orchestrator's turn cost.
6. **Snapshot/restore is deferred to "Module 7" in the source course** (not included in these lessons) — flag as a known gap if numa wants sandbox persistence across turns; the interface groundwork (`snapshot?()`) is already covered here.
