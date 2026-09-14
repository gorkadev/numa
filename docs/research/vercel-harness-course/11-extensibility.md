# Module 11 — Extensibility
Source lessons:
- Skills System — https://vercel.com/academy/build-ai-agent-harness/skills-system
- Custom Tools — https://vercel.com/academy/build-ai-agent-harness/custom-tools
- Extension Points — https://vercel.com/academy/build-ai-agent-harness/extension-points

## Skills System
**Core idea:** Progressive disclosure applied to specialized knowledge: skill *names and one-line descriptions* live in the system prompt permanently (cheap, always present), while full skill content sits in markdown files on disk and only enters context when the agent explicitly calls a `loadSkill` tool (also cheap, but conditional). This avoids pasting growing domain knowledge (auth conventions, db patterns, testing strategy, deployment notes) directly into the prompt, which stops scaling past a couple of packages.

**Key points:**
- Failure mode this fixes: pasting knowledge inline works for 1-2 packages; by 5 the system prompt is "fifteen thousand tokens long," paid on every call, and the agent has to rummage through all of it looking for the one relevant bullet.
- Skill = `{ name, description, path }`. Discovery scans `<dir>/<name>/SKILL.md` across multiple directories (`dirs: string[]`), because real harnesses look in more than one place — project-local first, global (e.g. `~/.harness/skills`) second — and **deduplicates by name with first-directory-wins**, so project-local skills can deliberately override global ones with the same name.
- Frontmatter parsing is intentionally minimal — no YAML library needed. A slice between the first `---` markers, splitting lines, and matching a `description:` prefix is enough; strips surrounding quotes.
- The `# Skills` system-prompt section is deliberately terse: one line per skill (`- name: description`), nothing more. Density matters — the point is the agent recognizes "this exists" at near-zero token cost, not that it understands the skill yet.
- `loadSkill` tool: takes `name`, looks it up in a `Map<name, Skill>` built from the discovered list, reads the file synchronously, and returns the content — **capped** at `MAX_SKILL_CHARS = 4000`, truncating with a `"... (truncated at 4000 chars)"` marker if exceeded. Explicitly ties this back to the same "prevention over cleanup" discipline used for tool-output caps earlier in the course, now applied at the knowledge layer.
- Tool description again does real steering work: WHEN TO USE ("the task touches a domain you have a skill for... check the # Skills section"), WHEN NOT TO USE ("tasks unrelated to any available skill"), DO NOT USE FOR ("tasks where the skill name is not in the listed skills") — guards against the model inventing a plausible-sounding skill name and calling `loadSkill` on something that doesn't exist.
- **Hard limitation, stated explicitly: "the model has to ask."** There is no auto-loading. The system prompt names the skills and the tool exposes them, but the model itself decides whether `loadSkill` is worth calling. This is a retrieval path, not a guarantee — if the model consistently skips a skill that would obviously help, the fix is sharper/more specific skill *descriptions*, not a mechanism change.
- Numeric intuition given directly: five skills × ~1000 words each pasted inline ≈ 5,000 tokens on *every* call forever; the same five skills as names + one-line descriptions ≈ ~100 tokens total. Full content only enters context on demand.
- Exercise/extension not built in the lesson: section-targeted loading — an optional `section: string` param on `loadSkill` so `loadSkill({ name: "auth-patterns", section: "OAuth flow" })` returns just one heading's content instead of the whole file, raising the open design question of where "skill as document" ends and "skill as a small searchable corpus" begins.

**Code patterns:**
```ts
// src/skills.ts
export interface Skill { name: string; description: string; path: string; }

function parseFrontmatter(md: string): { description?: string } {
  if (!md.startsWith("---")) return {};
  const end = md.indexOf("\n---", 3);
  if (end < 0) return {};
  const block = md.slice(3, end);
  const descLine = block.split("\n").find((l) => l.startsWith("description:"));
  return { description: descLine?.replace("description:", "").trim().replace(/^['"]|['"]$/g, "") };
}

export function discoverSkills(dirs: string[]): Skill[] {
  const skills: Skill[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry, "SKILL.md");
      if (existsSync(path) && !seen.has(entry)) {
        seen.add(entry);
        const content = readFileSync(path, "utf-8");
        const { description } = parseFrontmatter(content);
        skills.push({ name: entry, description: description ?? "(no description)", path });
      }
    }
  }
  return skills;
}
```
```ts
// system prompt section — names/descriptions only, ever
if (ctx.skills?.length) {
  const lines = ctx.skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  sections.push(`
# Skills
The following skills are available. Call \`loadSkill\` with the name to get full content.
${lines}`);
}
```
```ts
// src/tools.ts — loader tool with hard cap
export function createLoadSkillTool(skills: Skill[]) {
  const MAX_SKILL_CHARS = 4000;
  const byName = new Map(skills.map((s) => [s.name, s]));
  return tool({
    description: `Load the full content of a skill.
WHEN TO USE: the task touches a domain you have a skill for (auth, db, testing,
  deployment, etc.). Check the # Skills section in your instructions.
WHEN NOT TO USE: tasks unrelated to any available skill.
DO NOT USE FOR: tasks where the skill name is not in the listed skills.`,
    inputSchema: z.object({ name: z.string().describe("Skill name as listed in the Skills section") }),
    execute: async ({ name }) => {
      const skill = byName.get(name);
      if (!skill) return `Unknown skill: ${name}`;
      const content = readFileSync(skill.path, "utf-8");
      return content.length > MAX_SKILL_CHARS
        ? content.slice(0, MAX_SKILL_CHARS) + `\n... (truncated at ${MAX_SKILL_CHARS} chars)`
        : content;
    },
  });
}
```
Standard `tool()`/`z.object()` AI SDK shape throughout; no version-specific API here — this whole system is userland (filesystem + prompt string + one tool), not an AI SDK feature.

**Applies to numa:**
- This is the direct blueprint for numa's stated goal: replace the ~250-line always-in-prompt "engine block" (Three.js + game toolkit conventions) with a `SKILL.md`-per-topic structure (e.g. `skills/threejs-materials/`, `skills/collision/`, `skills/toolkit-api/`), each with a one-line description surfaced in the system prompt and full content behind a `loadSkill` tool call.
- The dedup/override-by-directory-priority pattern (project-local wins over global) maps well onto a two-tier setup for numa: a shipped baseline skill set (bundled with the toolkit) plus optionally per-game or per-project overrides, if that need ever arises.
- The hard truncation cap (4000 chars, explicit truncation marker) is a concrete number worth adopting as a starting default for numa's game-toolkit skill files, tuned to actual skill length once written.
- The single biggest risk this lesson flags for numa directly: "the model has to ask" — numa's current single always-loaded engine block *guarantees* the agent has the relevant API knowledge; moving to on-demand skills introduces a new failure mode (agent doesn't realize a skill applies and improvises/hallucinates a wrong toolkit API instead of loading the skill). Sharp, hook-y one-line descriptions per skill (not generic ones) are the main mitigation the lesson offers, and should be validated by testing that a same task before/after the split reliably triggers the right `loadSkill` call.

## Custom Tools
**Core idea:** Move from a hardcoded tool object built by hand in the entry point to a `ToolRegistry` (register/get/list/entries) so new tools can be added, and existing tools can be composed/wrapped with pre/post hooks, without forking the harness core.

**Key points:**
- Registry is deliberately minimal — a `Map<string, Tool>` behind `register`, `get`, `list`, `entries`. It owns **no policy**; whoever calls `register` decides what's allowed in. `entries(): [string, Tool][]` exists specifically so `Object.fromEntries(registry.entries())` can build the agent's `tools` object directly.
- Built-ins move into a `registerBuiltins(registry, sandbox, skills)` helper. **Registration order matters**: `task` (the subagent-spawning tool) needs `read` and `grep` already registered because it captures references to them (`registry.get("read")!`) — register in the wrong order and you get undefined references baked into the `task` tool.
- `wrapTool(base, { beforeExecute, afterExecute })` returns a *new* tool; the base tool is untouched in memory. `beforeExecute` can rewrite input before the base executes, `afterExecute` can post-process the result. This lets one project wrap a shared built-in (e.g. `bash`) without affecting other consumers of the original.
- Concrete `bash` wrapping example: rewrite any `bun test` command to append `--reporter=spec` before it reaches the base tool's `execute` — project-specific behavior grafted onto a shared tool with zero changes to the tool's own source.
- Adding a genuinely new tool (e.g. `deploy`) is just one `registry.register("deploy", tool({...}))` call after `registerBuiltins` runs — proven with a trivial `now` tool exercise (register → agent can call it; remove the line → agent correctly reports the tool doesn't exist).
- The lesson closes with an **extension-surface table** mapping every customizable part of the harness to its mechanism — useful as a mental map of the whole course's extensibility story:
  | Surface | What you can customize | How |
  |---|---|---|
  | Tools | Add, remove, wrap | Registry plus `wrapTool` |
  | Skills | Add specialized knowledge | `skills/` directory plus `loadSkill` |
  | Sandbox | Custom backends | `createSandbox` factory |
  | Approval | Custom policies | Config plus events |
  | System prompt | Custom sections | `PromptContext` plus `buildSystemPrompt` |
  | Model | Per-role models | Subagent definitions |
- Exercise not built: `registry.unregister(name)` plus a *replace* pattern (vs. wrap) — e.g. swapping the built-in `bash` for a project-specific version with a smaller safe-prefix allowlist — with an open question about what breaks if the replacement happens *after* the agent object is already constructed (tools would already be captured by reference).

**Code patterns:**
```ts
// src/registry.ts
export interface ToolRegistry {
  register(name: string, tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): string[];
  entries(): [string, Tool][];
}

export function createRegistry(): ToolRegistry {
  const tools = new Map<string, Tool>();
  return {
    register: (name, tool) => { tools.set(name, tool); },
    get: (name) => tools.get(name),
    list: () => [...tools.keys()],
    entries: () => [...tools.entries()],
  };
}
```
```ts
// wrapTool composition
export function wrapTool(base: Tool, hooks: WrapHooks): Tool {
  return tool({
    description: base.description,
    inputSchema: base.inputSchema,
    execute: async (input) => {
      const transformed = hooks.beforeExecute ? await hooks.beforeExecute(input) : input;
      const result = await base.execute(transformed);
      return hooks.afterExecute ? await hooks.afterExecute(result) : result;
    },
  });
}
```
```ts
// wiring: agent tools derived from the registry, not hardcoded
const agent = new ToolLoopAgent({
  tools: Object.fromEntries(registry.entries()),
  instructions: buildSystemPrompt({ toolNames: registry.list(), /* ... */ }),
});
```

**Applies to numa:**
- numa's current tool set (`read_file`, `list_files`, `write_file`, `replace_text`, `delete_file`, `ask_player`) is almost certainly still hardcoded in the `chat.agent` task definition — this registry pattern is directly applicable groundwork for the planned multi-agent harness, where different phases/specialist workers will likely need different (but overlapping) tool subsets, and a registry with `wrapTool` composition is a cleaner seam than duplicating tool-building code per worker type.
- The `wrapTool` pattern is a good fit for adding cross-cutting numa-specific behavior without touching individual tool implementations — e.g. wrapping `write_file`/`replace_text` to reject writes outside the game project directory, or wrapping `bash`-equivalent sandbox exec calls with numa-specific safety rules, mirroring the Module 8 approval-events use case.
- The registration-order caveat (dependent tools need their dependencies registered first) is directly relevant if numa's planned `task`-like subagent-spawning tool for specialist workers captures references to other tools — worth designing the registration sequence deliberately rather than discovering the bug at runtime.
- The extension-surface table is a useful checklist against numa's stated harness goals: numa already covers "Skills" and partially "System prompt" in its plans; "Sandbox" is already abstracted (Daytona); "Approval" and a formal "Tools" registry are the two rows numa doesn't yet have and that this course module + Module 8 map onto directly.

## Extension Points
**Core idea:** A small typed event bus (`EventBus` with `on`/`emit` over five lifecycle event names) is the primitive for cross-cutting concerns that don't belong inside any single tool — logging, blocking specific writes, wrapping commands, checkpointing on shutdown. Handlers can pass through, block, or modify the event data, and run in registration order with early-exit on block.

**Key points:**
- The five lifecycle events named: `session_start`, `tool_call`, `tool_result`, `session_before_compact`, `session_shutdown`. Explicitly kept small — "five names cover the moments where extensions usually need to plug in... starting with five is what keeps the contract legible."
- `EventResult = { block?: boolean; reason?: string; modify?: any } | void` — a handler returning nothing/`undefined` passes through; returning `{ block: true, reason }` stops the call and the reason is fed back to the model *as the tool result*, so the model sees the policy violation in plain text and can relay it to the user; returning `{ modify }` lets the harness apply a data transformation before continuing (e.g. injecting extra instructions).
- Four worked examples, each showing a distinct return behavior:
  1. **Logging** (`tool_call`, no return) — pure observability, passes through.
  2. **Blocking protected files** (`tool_call`, `{ block: true, reason }`) — checks `PROTECTED = [".env", "package-lock.json"]` against write paths.
  3. **Compaction safety injection** (`session_before_compact`, `{ modify: { customInstructions: "..." } }`) — addresses a real risk that safety constraints/approval rules can "leak" (get dropped) across a context-compaction event; re-injects them as an instruction before compaction proceeds.
  4. **Auto-commit on shutdown** (`session_shutdown`, side effect) — runs `git status --porcelain`, and if dirty, `git add -A && git commit -m "WIP: auto-save"`. Framed explicitly as "the cloud-sandbox `beforeStop` hook... generalized": any session end, for any reason, gets a checkpoint opportunity.
- **Chaining rule, stated precisely:** multiple handlers on the same event run in *registration order*. First handler to return `block: true` stops the call (its reason goes to the model; execution does not proceed). If any handler returns `modify`, subsequent handlers in the chain see the already-modified data. Order is not cosmetic — e.g. put logging *before* safety checks so blocked attempts still get logged, not just successful ones; put telemetry *after* the result to capture what actually ran, not what was attempted.
- Explicit relationship to earlier layers, stated directly:
  - Module 2's approval config sets the operational *mode* and still runs at the tool level.
  - The event bus runs *around* the tool layer — a `tool_call` handler can block a call even when the approval config would otherwise have passed it (defense in depth, same point as Module 8's Approval Config lesson).
  - Earlier lifecycle hooks (`afterStart`, `beforeStop` from an earlier sandbox module) conceptually overlap with `session_start`/`session_shutdown` — the event bus is just the more general form; the named hooks are convenience wrappers for the most common cases.
  - Skills are explicitly **not** wired through events — "the model decides whether to load a skill, not the harness," so skill loading is a separate retrieval surface, deliberately outside the event system.
- **Deliberate sequencing note (why this is the last lesson in the course):** the event bus is called out as "the most flexible extension surface and the most dangerous one" — a bad handler can deadlock the agent, leak secrets through logging, or block legitimate calls. Teaching it last, after tools/sandboxes/prompts/context/subagents/lifecycle hooks are already understood, is deliberate: introduced earlier, the temptation would be to solve every problem with `on('tool_call', ...)` and the harness would degrade into one giant handler instead of using the right layer for each concern.
- This lesson is conceptual/sketch-only in the build-along — no working event bus ships in the course repo; implementation is described as small (`Map<string, Handler[]>` plus an `emit` with early-exit-on-block) but is left as a take-home exercise, recommended to be built on a separate branch and exercised with a logging extension before any blocking one.

**Code patterns:**
```ts
// src/events.ts (sketch)
type LifecycleEvent = "session_start" | "tool_call" | "tool_result" | "session_before_compact" | "session_shutdown";
type EventResult = { block?: boolean; reason?: string; modify?: any } | void;

interface EventBus {
  on(event: LifecycleEvent, handler: (data: any) => Promise<EventResult>): void;
  emit(event: LifecycleEvent, data: any): Promise<EventResult[]>;
}
```
```ts
// block example
bus.on("tool_call", async ({ toolName, input }) => {
  if (toolName === "write" && PROTECTED.some((p) => input.path.endsWith(p))) {
    return { block: true, reason: `${input.path} is protected by policy.` };
  }
});
```
```ts
// modify example — re-inject constraints before compaction
bus.on("session_before_compact", async () => {
  return { modify: { customInstructions: "Preserve all safety constraints and approval rules across compaction." } };
});
```
Chain trace shown in the lesson for intuition:
```
Tool call requested
  -> emit "tool_call"
       handler 1: log (pass through)
       handler 2: check protected files (may block)
       handler 3: project safety policy (may block)
  -> if any blocked: return reason to model, do not execute
  -> if all passed: execute tool
  -> emit "tool_result"
       handler 1: log result
       handler 2: telemetry
```

**Applies to numa:**
- This is the natural home for several numa needs identified elsewhere in this research: protecting toolkit files / sandbox path boundaries (Module 8's approval-events use case), and any future "block writes outside the game directory" rule — implementing them as `tool_call` handlers keeps that logic out of every individual tool's `execute` and in one auditable place.
- `session_before_compact` is directly relevant to numa's context-resilience concerns for long chat threads (compaction is called out by the trigger-chat-agent-advanced skill as a real concern for `chat.agent`) — the pattern of re-injecting critical instructions before compaction to stop them "leaking" is a concrete, reusable technique numa should consider once/if compaction becomes a practical issue in production threads.
- `session_shutdown` auto-checkpointing (git commit on exit) doesn't map onto numa's game-generation use case as-is (games aren't necessarily git-tracked inside the Daytona sandbox), but the general idea — give every session end a guaranteed checkpoint hook regardless of *why* it ended (completed, cancelled, crashed) — is relevant to numa's sandbox teardown and any "save game state" requirement.
- The sequencing lesson itself (build this last, after tools/skills/prompt/sandbox are solid, to avoid it becoming a dumping ground) is good process advice for numa's own harness roadmap: the event-bus-shaped work (approval events, compaction safety, shutdown hooks) should come after the more foundational multi-agent orchestrator/todo/skills work is in place, not before.

## Module takeaways for numa
1. Skills System is the most directly actionable module for numa's stated goal — it's an almost 1:1 blueprint for replacing the ~250-line always-loaded engine block with `SKILL.md` files + a `loadSkill` tool, including a concrete truncation cap (4000 chars) and an explicit warning that the model must be prompted well enough to actually call `loadSkill` when relevant.
2. Custom Tools' registry pattern is the right foundation to build *before* the multi-agent orchestrator work, since different phases/specialist workers will need different but overlapping tool subsets — `wrapTool` composition is a cleaner mechanism for numa-specific safety rules (e.g. path-scoped write protection) than modifying each tool's `execute`.
3. Extension Points' event bus is the natural home for cross-cutting policy (file/path protection, compaction-safety re-injection) once the more foundational pieces exist — but the course's own sequencing advice (build it last) is worth following: don't let it become the default answer to every problem before the tool/skill layers are solid.
4. The extension-surface table (Tools / Skills / Sandbox / Approval / System prompt / Model) is a good checklist to size numa's remaining harness work: numa already has Sandbox and partial System-prompt coverage; Skills, a formal Tools registry, and Approval/event-based policy are the gaps this module and Module 8 map onto.
