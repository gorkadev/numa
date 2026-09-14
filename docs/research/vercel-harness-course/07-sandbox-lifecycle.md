# Module 7 — Sandbox Lifecycle
Source lessons:
- State Machine — https://vercel.com/academy/build-ai-agent-harness/state-machine
- Snapshot and Restore — https://vercel.com/academy/build-ai-agent-harness/snapshot-and-restore
- Durable Workflows — https://vercel.com/academy/build-ai-agent-harness/durable-workflows
- Hard-Won Lessons — https://vercel.com/academy/build-ai-agent-harness/hard-won-lessons

## State Machine
**Core idea:** A cloud sandbox is not binary "running/stopped" — it moves through four states (provisioning → active → hibernating → hibernated, with restore going hibernated → active), driven by two timeouts and one activity tracker, and getting any one of those three pieces wrong is what shows up as an inflated bill.

**Key points:**
- Four states and their cost profile:
  | State | What's happening | Cost |
  |---|---|---|
  | Provisioning | VM spinning up, deps installing | Billing has started |
  | Active | Agent working, commands run, files change | Full per-minute cost |
  | Hibernating | Snapshot in progress, sandbox finishing up | Full per-minute cost |
  | Hibernated | VM stopped, snapshot stored | Storage cost only |
  Active is the expensive state; hibernated is the cheap one. The two *transition* states (provisioning, hibernating) are short but still billed at full rate — minimize how often they fire.
- **Hard expiry**: provider-set maximum VM lifetime (1–4 hours depending on platform). Cannot be extended or negotiated — the VM is killed when it hits zero regardless of in-flight work. The only options are finishing before it fires or snapshotting before it does.
- **Inactivity window**: harness-controlled. After N minutes with no activity, the sandbox hibernates itself. Guidance given: 5 minutes is a reasonable default for agent workloads; 2 minutes is aggressive (hibernates *between turns*); 20 minutes is loose (paying for idle time).
  ```ts
  const INACTIVITY_WINDOW = 5 * 60 * 1000;
  ```
- Activity-counts table — this is the crux of getting the inactivity window right:
  | Event | Counts as activity? |
  |---|---|
  | Chat message from user | Yes |
  | Tool call executed | Yes |
  | Sandbox event (file write, process spawn) | Yes |
  | Status polling | No |
  | Reconnect probe | No |
  | Health check | No |
  Get this backwards either direction and you get a real failure mode: status polling counted as activity → sandbox never hibernates, you pay for idle hours; tool calls *not* counted → sandbox hibernates mid-task, in-progress work is lost.
- Worked timeline example (0:00 message → 0:05 npm install → 0:13 inactivity fires → hibernate → 0:20 reconnect/restore → 1:30 hard expiry kills VM) is used to pose two open design questions with no single right answer: when to warn the user that hard expiry is approaching, and when to auto-snapshot so the user can resume after expiry — the lesson states there's a wrong answer (do nothing) and a less-wrong one (auto-snapshot at ~80% of hard expiry).

**Code patterns:** Only the `INACTIVITY_WINDOW` constant above; this is a concept lesson (no lifecycle code introduced beyond that). Ties back to Module 4's lifecycle hooks (`afterStart`/`beforeStop`) as the place to attach `lastActivityAt` and `hardExpiryAt` state for a real cloud backend — local/`just-bash` backends don't fire these timeouts at all.

**Applies to numa:**
- numa already runs "one Daytona sandbox per game; started/stopped" — this state machine is the exact model to adopt explicitly: track `provisioning/active/hibernating/hibernated` per game sandbox rather than an implicit boolean, and treat hard expiry (Daytona's max VM lifetime) as non-negotiable in the chat.agent's turn logic.
- The activity table maps directly onto numa's `chat.agent` events: a player chat message, a tool call (`read_file`/`write_file`/etc.), or a sandbox file write should reset the inactivity clock; Trigger.dev run-status polling or any internal health check must not.
- Numa's `ask_player` suspend is a real edge case this table doesn't cover explicitly: a suspended run waiting on the player is *not* sandbox activity — the inactivity clock should likely keep ticking (or the sandbox should hibernate proactively) while waiting on `ask_player`, since the agent isn't doing sandbox work during that wait. Worth an explicit product decision, not an assumption.
- The 5-minute default inactivity window is a reasonable starting point for numa's per-game Daytona sandboxes, but should be tuned against actual player think-time between turns (numa's turns are chat-paced, likely longer gaps than a coding agent's tool loop).

## Snapshot and Restore
**Core idea:** `snapshot()` freezes sandbox filesystem state and returns an ID; `restore` (creating a new sandbox from a `snapshotId`) reconstructs the same files on a different VM — the mechanics are trivial, but there are exactly three idempotency hazards that account for most of the production bugs around this API.

**Key points:**
- The API surface:
  ```ts
  const { snapshotId } = await sandbox.snapshot!();
  const restored = await createCloudSandbox({ snapshotId });
  ```
- What a snapshot preserves: filesystem contents (workspace root, installed packages, agent-created files). What it does **not** preserve: running processes, in-flight network connections, in-memory state. A build halfway through compiling does not resume after restore — the filesystem snapshots, the work-in-progress does not. Practical implication for the agent's mental model: after restore it has all its files back, but anything it was mid-running (e.g., tests) has to run again.
- **Hazard 1 — snapshot already in progress**: without a guard, concurrent snapshot calls fight over the same VM or produce a partial/corrupt snapshot. Fix: cache the in-flight promise, return it to any caller that arrives while one is running, clear it when done.
  ```ts
  let inFlight: Promise<{ snapshotId: string }> | null = null;
  snapshot: async () => {
    if (inFlight) return inFlight;
    inFlight = vm.snapshot();
    try { return await inFlight; } finally { inFlight = null; }
  },
  ```
- **Hazard 2 — sandbox already running on restore**: reconnecting to an active session while a restore also fires creates a second VM — wasted cost, and the old one is still serving traffic. Fix: always check for an existing active sandbox before restoring.
  ```ts
  async function attachOrRestore(sessionId: string, snapshotId: string) {
    const existing = await findActiveSandbox(sessionId);
    if (existing) return existing;
    return createCloudSandbox({ snapshotId });
  }
  ```
- **Hazard 3 — double stop**: `stop` called twice (inactivity timer + user, or hibernate + hard expiry) hits an already-gone VM the second time — depending on provider, fails loudly or silently corrupts state. Fix: a boolean guard so the second call is a no-op.
  ```ts
  let stopped = false;
  stop: async () => {
    if (stopped) return;
    stopped = true;
    await vm.close();
  },
  ```
- **What restore doesn't solve**: a snapshot is a point-in-time artifact. Restoring an old snapshot after the project has moved on (new commit, new package, new env var) gives you a "fossil" sandbox. Production fixes: either invalidate snapshots when the project changes, or re-run setup hooks (Module 4's `afterStart`) after every restore. Neither happens automatically — both must be deliberately wired in.
- Local sandbox can *fake* a snapshot with `git stash` + stash ref as a fake `snapshotId`, or a tarball — explicitly called out as not equivalent to a real cloud snapshot (no VM state, no install caches) but useful for learning the seam.

**Code patterns:** All three idempotency guards shown above (`inFlight` promise cache, `findActiveSandbox` pre-check, `stopped` boolean) are the load-bearing snippets — small, guard-clause-shaped, meant to be copied close to verbatim into any real lifecycle implementation.

**Applies to numa:**
- Directly relevant if numa ever snapshots a game's Daytona sandbox (e.g., to let a player resume a build later without keeping the sandbox hot): the three guards should be applied verbatim around numa's sandbox start/stop calls in the `chat.agent` task.
- The "restore doesn't solve staleness" point matters for numa specifically: if the bundled game toolkit or `packages/db` schema changes between when a game's sandbox was snapshotted and when it's restored, the restored sandbox is running against an old toolkit version — numa needs an explicit policy (re-run setup on restore, or invalidate old snapshots) rather than assuming restored sandboxes are current.
- Hazard 3 (double stop) is concretely relevant to numa's current single-sandbox-per-game model: a Trigger.dev run ending normally *and* an inactivity-driven stop firing near-simultaneously is a realistic race; a `stopped` boolean (or equivalent idempotent stop in whatever sandbox wrapper numa uses) should be verified to exist.
- Hazard 1 (concurrent snapshot) is lower priority for numa today since there's no evidence numa snapshots sandboxes yet — flag as "not applicable until snapshotting is added," not as a current gap.

## Durable Workflows
**Core idea:** A lifecycle loop that needs to "poll every 30s, hibernate when idle" cannot be built with `setTimeout`/`setInterval` in a serverless environment, because the function (and its timer) dies when the request ends; a durable workflow runtime (Vercel Workflow, or equivalents like Temporal/AWS Step Functions) provides a `sleep()` that checkpoints to durable storage and resumes across function instances, deploys, and host restarts.

**Key points:**
- Why `setTimeout(() => checkAndSnapshot(), 30_000)` fails in serverless: the calling function returns, the runtime tears down its process, the timeout is garbage collected, the check never runs — the sandbox keeps running and the bill reflects it. Even if the function somehow stayed alive for the first check, a redeploy would still lose all timer state.
- The workflow pattern: mark the function `"use workflow"`, call `sleep(seconds)` from `workflow/sleep` in a `while (true)` loop. `sleep()` does not block the process — it checkpoints the workflow's execution state to durable storage and returns; when the interval elapses, the workflow resumes from exactly that point, on whatever function instance happens to be available, surviving deploys and restarts. The loop body around it is ordinary code.
  ```ts
  "use workflow";
  import { sleep } from "workflow/sleep";
  const POLL_INTERVAL = 30;
  const INACTIVITY_WINDOW = 5 * 60;
  export async function sandboxLifecycle(sandboxId: string) {
    while (true) {
      await sleep(POLL_INTERVAL);
      const status = await checkSandboxStatus(sandboxId);
      if (status === "expired") break;
      if (status.lastActivity + INACTIVITY_WINDOW < Date.now() / 1000) {
        await snapshotAndStop(sandboxId);
        break;
      }
    }
  }
  ```
- **Step boundary**: any call to an external system (provider APIs, your DB, any side effect) inside the workflow must live in a separate `"use step"` function. Step functions get automatically retried on transient failure and cached on success once they complete; the workflow loop just calls them like normal async functions and the runtime supplies durability.
  ```ts
  "use step";
  export async function checkAndSnapshotStep(sandboxId: string) {
    const sandbox = await getSandbox(sandboxId);
    if (!sandbox.isActive) return { action: "stop" };
    const idle = Date.now() - sandbox.lastActivityAt;
    if (idle > INACTIVITY_WINDOW) {
      await sandbox.snapshot();
      await sandbox.stop();
      return { action: "hibernated" };
    }
    return { action: "continue" };
  }
  ```
- Cost math given as concrete numbers: no lifecycle management → sandbox runs to hard expiry (4h) → 4h × $0.02/min = $4.80/session. Inactivity-based hibernation (5 min idle threshold) → ~25 min × $0.02/min = $0.50/session. Roughly an order-of-magnitude saving on long/idle-heavy sessions, compounding across users and time.
- The pattern (a `sleep` that survives function boundaries, work delegated to retried/cached step functions) is framework-agnostic — Vercel Workflow, Temporal, AWS Step Functions all implement the same shape. "Roll your own only if you really mean it."
- Where the course's own demo stops short: the local and `just-bash` backends never run a durable workflow at all, because their lifetime is just the host process's lifetime — there's no inactivity to hibernate against. The intended integration point is Module 4's lifecycle hooks: `afterStart` would launch the durable workflow, `beforeStop` would tell it to wrap up, and the workflow calls back into the sandbox through the same `Sandbox` interface (`snapshot()`, `stop()`) as any other consumer — which is *why* that interface exists in the shape it does: to let both the synchronous local world and the async multi-deploy cloud world sit behind one surface.

**Code patterns:** The `"use workflow"` / `"use step"` directive pair and the `sleep()` import from `workflow/sleep` are the two load-bearing, framework-specific APIs — flagged explicitly as version/platform-specific (Vercel Workflow), not a generic AI SDK API. Note this is distinct from Trigger.dev's own durability model (numa's actual runtime).

**Applies to numa:**
- numa already runs its chat agent as a **Trigger.dev `chat.agent` task**, which is itself durable and long-lived (suspends on `ask_player`) — Trigger.dev is numa's equivalent of "the durable workflow runtime" this lesson argues for, so numa does not need to adopt Vercel Workflow specifically, but the underlying principle (never use bare `setTimeout` for lifecycle polling across function boundaries) still applies to any code *outside* the `chat.agent` task, e.g., a separate cron/scheduled task responsible for hibernating idle Daytona sandboxes.
- If numa builds sandbox-idle-hibernation for its per-game Daytona sandboxes, the natural shape is a Trigger.dev **scheduled task** (or a durable wait/sleep primitive within Trigger.dev) polling sandbox activity and calling `snapshot`/`stop`, mirroring this lesson's `sandboxLifecycle` loop — not a `setInterval` inside the main chat task.
- The step-function idea (side-effecting calls isolated, auto-retried, cached on success) maps onto Trigger.dev's own task/subtask retry semantics — worth confirming numa's sandbox lifecycle calls (if/when built) are similarly isolated rather than inlined into the main agent loop where a transient failure could corrupt turn state.
- The cost-math framing (idle sandbox = full per-minute burn) is a direct argument for numa to budget and monitor per-game Daytona sandbox idle time, especially since numa already meters *tokens* per turn for credits — sandbox compute cost is a second, currently separate cost axis worth tracking the same way.

## Hard-Won Lessons
**Core idea:** Five specific, previously-shipped production bugs in cloud sandbox lifecycle management, each with a named failure mode and a small fix pattern — presented as things that look obvious in hindsight but recur across providers and implementations because they aren't obvious in advance.

**Key points:**
- **Stale handles after reconnect**: a reconnected sandbox handle looks valid but its command stream is broken — the session inside survived the object reference, not the underlying connection; commands go in, garbage or nothing comes back. Fix: probe a reconnected handle with a cheap read-only command before trusting it; on failure, recreate from the last snapshot.
  ```ts
  const sandbox = await reconnect(sandboxId);
  const probe = await sandbox.exec("echo probe");
  if (probe.exitCode !== 0 || probe.stdout.trim() !== "probe") {
    sandbox = await createFromSnapshot(lastSnapshotId);
  }
  ```
- **Stale expiry data**: caching a sandbox's `expiresAt` at creation time and later computing `remainingTimeout = expiresAt - now()` from that cache risks acting on stale data — worst case, passing an already-negative/expired timeout to a provider API. Fix: always re-fetch fresh expiry from the provider immediately before any lifecycle decision; cache expiry only for display purposes, never for control flow.
  ```ts
  const { expiresAt } = await sandbox.getStatus();
  if (expiresAt < Date.now()) { await beforeStop?.(sandbox); }
  ```
- **Polling resets inactivity**: if a lifecycle workflow's own 30-second status poll is (mis)counted as activity, the inactivity window never closes and the sandbox runs to hard expiry every time — described as "a clean pure-function bug masquerading as an integration issue." Fix has to live in two places at once: the activity tracker must whitelist only genuine event kinds, and status-check code paths must not emit activity-coded events.
  ```ts
  function recordActivity(event: SandboxEvent) {
    if (event.kind === "user_message" || event.kind === "tool_call" || event.kind === "fs_change") {
      sandbox.lastActivityAt = Date.now();
    }
  }
  ```
  Status pings, health checks, reconnect probes, and billing reads must never reset the timer.
- **Auto-resume loops**: reconnect triggers auto-resume from the last snapshot → the resume triggers a lifecycle check → the check sees no activity yet and decides to hibernate → hibernation triggers the next auto-resume on the following reconnect attempt → infinite loop built from two pieces of code that are each individually correct. Fix: auto-resume only on the *initial* entry into a session; subsequent reconnects to an already-active sandbox simply attach to it instead of triggering another resume.
  ```ts
  if (isInitialEntry && sandbox.state === "hibernated") {
    await restore(sandbox.snapshotId);
  }
  ```
  The state machine (Lesson 24) is explicitly the guard here: active → attach; hibernated → restore; anything else → wait or fail. Never chain transitions automatically.
- **State divergence**: sandbox state exists in three places — provider API, your database, client's local cache — and they will diverge. Whichever one you trust when they disagree determines whether the resulting error costs you money or costs you user trust. Fix: the provider API is the single source of truth for any state actually *displayed or acted on*; your DB and any client cache are caches, not truth. When in doubt, fetch fresh from the provider.
  ```ts
  const { state } = await provider.getSandboxStatus(sandboxId);
  ui.showState(state);
  ```
- **Combinations are worse than individuals** (explicit warning): a stale handle plus a polling-counts-as-activity bug means paying for a sandbox you can't even talk to; a divergent cache plus an auto-resume loop means creating three duplicate sandboxes for one user. Recommended posture: fix all five gotchas defensively, even ones that seem unlikely in your specific environment — don't triage them individually.
- Suggested practice: build a `--chaos` test flag that randomly injects exactly one of these failure classes per test session (kill sandbox mid-command, return a stale handle on reconnect, force cache/provider divergence, skip one status update) and run the full agent loop under it — "the first thing that breaks is the gotcha you forgot to defend against."

**Code patterns:** Five short guard snippets, one per gotcha (shown above) — each is a defensive check placed at a specific call site (reconnect, expiry read, activity recorder, resume trigger, state display), not a structural redesign. They compose with the idempotency guards from the snapshot/restore lesson (e.g., the "double stop" guard there directly prevents part of what "auto-resume loops" here can trigger).

**Applies to numa:**
- **Stale handles after reconnect** is highly relevant: numa's `chat.agent` suspends on `ask_player` and resumes later, potentially reconnecting to the same Daytona sandbox after a gap — a probe-before-trust step (e.g., a cheap `list_files` call) before resuming tool execution would guard against exactly this.
- **Polling resets inactivity** and **stale expiry data** both apply directly if numa adds any sandbox-idle-hibernation mechanism per the Durable Workflows lesson — any Trigger.dev status/health check task must be excluded from numa's activity definition, and expiry must always be read fresh from Daytona, never cached.
- **Auto-resume loops** is a concrete risk for numa's suspend/resume-on-`ask_player` flow: a resumed run should attach to an already-active sandbox rather than unconditionally re-provisioning/restoring, or numa risks the same resume→check→hibernate→resume cycle described here.
- **State divergence** is directly actionable: numa should treat Daytona's sandbox status API as the source of truth for any UI showing sandbox/game state, and treat Trigger.dev run state or any local DB record of "sandbox started" as a cache only — worth auditing numa's current sandbox-status code path against this.
- The `--chaos` testing suggestion is a good candidate technique for numa's integration tests around sandbox start/stop/reconnect, once that logic exists, but is aspirational rather than something numa has today — flag as a future testing investment, not a current gap.

## Module takeaways for numa
1. **Provider API is the source of truth for sandbox state — numa's DB/UI cache is not.** The single highest-value rule: whenever numa displays or decides based on a Daytona sandbox's status, fetch fresh rather than trusting a cached/derived value, especially across the `ask_player` suspend/resume boundary.
2. **The `ask_player` suspend is an activity-tracking edge case numa must decide explicitly.** Neither this course's activity table nor its lifecycle examples cover "waiting on the user mid-task" — numa needs its own policy for whether a suspended run should let its sandbox hibernate.
3. **Auto-resume-on-reconnect must be gated to the initial entry only**, with a stale-handle probe before resuming tool calls — directly protects numa's resume-after-`ask_player` path from both dead handles and resume/hibernate loops.
4. **Any future sandbox-lifecycle polling belongs in a separate durable task (Trigger.dev scheduled/durable primitive), never a bare timer inside the main chat.agent loop** — the `setTimeout`-dies-in-serverless argument transfers even though numa's actual durability engine (Trigger.dev) differs from the lesson's (Vercel Workflow).
5. **The three snapshot/restore idempotency guards (in-flight cache, active-sandbox check before restore, stopped-boolean on stop) are cheap insurance to add now**, even before numa implements snapshotting, since the double-stop race (Trigger.dev run ending vs. an inactivity-driven stop) is plausible with today's one-sandbox-per-game model.
6. **Sandbox compute time is a second, currently-untracked cost axis alongside numa's per-turn token ledger.** The course's concrete cost math (idle sandbox ≈ 10x more expensive than hibernation-managed) argues for eventually metering/alerting on Daytona sandbox active-time the same deliberate way numa already meters LLM tokens for credits.
