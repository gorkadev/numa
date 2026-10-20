# Make agent activity visible in the chat thread

**Status: research complete; implementation not authorized.**

Numa can improve the visibility of existing tool and subagent activity using shadcn/ui's AI Elements patterns. Start with the information already available, retain the current detail views, and validate reasoning/source delivery before promising those surfaces. This document is a research baseline and discussion backlog, not an approved execution plan.

## Scope and source coverage

Read the complete changelog and all 21 Base pattern pages, plus the introduction and Patterns section of the index. External-project migration sections were intentionally excluded. Documentation describes available compositions, not proof that Numa produces their inputs.

- [October 2026 changelog](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements.md)
- [AI Elements introduction and pattern index](https://ui.shadcn.com/docs/ai-elements.md)
- Pattern source links appear in the inventory below. Append `.md` to the documentation route to obtain Markdown.
- Repository findings describe the inspected working tree, including user-installed components, not a clean committed baseline.

## Main findings

1. **AI Elements are owned compositions, not another dependency.** Copy and adapt a pattern built from existing shadcn/ui primitives. Do not install or migrate an external AI Elements package.
2. **Trace is the activity vocabulary.** Nested lines express summaries, actions, status, and expandable details. Code Block handles code, output, logs, and diffs.
3. **Numa already has a substantial activity model.** Tool calls, subagent activity, tool/edit counts, status, and usage can support richer presentation without inventing new agent behavior.
4. **Some information is hidden at rendering time; some is deliberately reduced earlier.** These are different problems and require different changes.
5. **Readable reasoning is not established.** Reasoning-token accounting exists, but it does not prove readable reasoning text exists in messages. Subagent reasoning/source events are explicitly skipped.
6. **More information should mean progressive disclosure, not a wall of logs.** Preserve chronological activity and actionable summaries in the thread; expose details on demand without taking away the existing subagent inspector.

## Composition model

| Layer | Role | Numa implication |
| --- | --- | --- |
| Message Scroller | Thread viewport and streaming follow/anchor behavior | Preserve scrolling, anchoring, and user navigation while enriching turns. |
| Message / Bubble | Turn and user/assistant content | Keep the current message structure; do not replace it simply to adopt activity patterns. |
| Trace | Agent steps, nested summaries, status, links, expandable details | Reusable foundation for tools, subagents, tasks, reasoning, and sources. |
| Code Block | Code, terminal output, logs, diffs, compact detail output | Reuse for appropriate structured detail instead of rendering raw JSON everywhere. |
| Marker / Attachment / Questionnaire | Dividers, files, clarifying questions | Complementary primitives, not substitutes for activity or authorization. |
| AI Elements patterns | Application-specific compositions of those primitives | Adapt to Numa's event contracts rather than copying demo contracts blindly. |

The changelog introduces Trace and Code Block across Base UI, React Aria, and Radix and all eight styles. This research follows the **Base** pattern examples, consistent with the repository's `base-rhea` configuration.

## Complete pattern inventory

All names link to the Markdown source read for this research. Priority is a recommendation for discussion, not implementation approval.

| Pattern | Purpose / composition | Required information or behavior | Numa fit |
| --- | --- | --- | --- |
| [Chain of Thought](https://ui.shadcn.com/docs/ai-elements/base/chain-of-thought.md) | Trace summary expanding into observable steps and outputs | Ordered tool/action parts, running/error/completion state | High: turn-level activity summary. The name does not authorize exposing hidden model reasoning. |
| [Chat](https://ui.shadcn.com/docs/ai-elements/base/chat.md) | Message Scroller + Message + Bubble + input | Messages, streaming state, send/reset, scroll anchor | Existing foundation; preserve behavior rather than rebuild. |
| [Checkpoint](https://ui.shadcn.com/docs/ai-elements/base/checkpoint.md) | Marker + restore action | Stable checkpoint identity and real restore semantics | Conditional: truncating chat is not sufficient to restore game/project state. |
| [Confirmation](https://ui.shadcn.com/docs/ai-elements/base/confirmation.md) | Approval decision outside activity Trace; subsequent tool activity inside it | Tool approval ID, approve/deny response, resume behavior | Conditional: requires a genuine approval contract. Clarifying questions are not approvals. |
| [Context](https://ui.shadcn.com/docs/ai-elements/base/context.md) | Hover Card + Progress usage breakdown | Token counts and verified model context limit | Useful, but token usage is not automatically current context occupancy, especially with compaction. |
| [File Tree](https://ui.shadcn.com/docs/ai-elements/base/file-tree.md) | Recursive Collapsible folders and selectable files | Normalized changed paths/tree and selection action | Useful for changed-file summaries; records are bounded, not necessarily a complete filesystem diff. |
| [Inline Citation](https://ui.shadcn.com/docs/ai-elements/base/inline-citation.md) | Hover Card source attached to text | Trusted URLs and a supported claim-to-source association | Later: a list of source URLs alone does not establish sentence-level attribution. |
| [Message](https://ui.shadcn.com/docs/ai-elements/base/message.md) | Turn content plus copy/edit/feedback/retry actions | Roles, content, streaming state, supported actions | Already substantially present; review consistency and action scope. |
| [Model Selector](https://ui.shadcn.com/docs/ai-elements/base/model-selector.md) | Radio menus for model and effort | Server-validated model/effort choices | Optional: preserve Numa's tier abstraction; do not introduce arbitrary provider choices. |
| [Plan](https://ui.shadcn.com/docs/ai-elements/base/plan.md) | Collapsible Trace containing known future steps | Stable `data-plan` ID, title, done/running/pending steps | Valuable if a real plan producer is established. Do not infer a plan from past tool calls. |
| [Prompt Input](https://ui.shadcn.com/docs/ai-elements/base/prompt-input.md) | Input Group, attachments, send and options | Text/files, removal, submit/stop behavior | Existing surface; incremental polish rather than the core information gap. |
| [Queue](https://ui.shadcn.com/docs/ai-elements/base/queue.md) | Trace sections for pending/completed todo items | Latest complete todo-tool input and item statuses | Conditional: requires an authoritative todo list; not a second copy of Plan. |
| [Reasoning](https://ui.shadcn.com/docs/ai-elements/base/reasoning.md) | Streaming Trace line with expandable text | Provider-exposed reasoning parts; optional measured duration | High interest, data-gated. Do not manufacture chain-of-thought or infer text from token counts. |
| [Sources](https://ui.shadcn.com/docs/ai-elements/base/sources.md) | Expandable Trace list of source links | `source-url` or equivalent trusted payload, URL deduplication | Data-gated: no working source producer/render path confirmed. |
| [Stack Trace](https://ui.shadcn.com/docs/ai-elements/base/stack-trace.md) | Failed action, code output, stack frames | Structured error/stack and safe disclosure policy | Developer-oriented; do not expose raw server paths/stacks to players. |
| [Subagent](https://ui.shadcn.com/docs/ai-elements/base/subagent.md) | Nested Trace of run, tools, and result | Run identity, activity, preliminary/final output, nested detail | Highest fit: enrich inline entries while preserving the inspector. Existing records are not full child transcripts. |
| [Suggestion](https://ui.shadcn.com/docs/ai-elements/base/suggestion.md) | One-click prompt buttons | Curated prompts and send behavior | Optional contextual convenience, not an observability fix. |
| [Task](https://ui.shadcn.com/docs/ai-elements/base/task.md) | Trace of steps discovered during execution | Stable per-task data ID and status updates | Strong fit for actual build/verification activity after defining the event adapter. |
| [Terminal](https://ui.shadcn.com/docs/ai-elements/base/terminal.md) | Command Trace with streaming Code Block output | Command identity, exit code, incremental output correlated to tool-call ID | Conditional: current tool completion output does not establish a live stdout stream. |
| [Test Results](https://ui.shadcn.com/docs/ai-elements/base/test-results.md) | Nested run → suite → test Trace with failure output | Structured suites/tests, pass/fail/skip, errors | Useful where real structured verification results exist; do not fabricate tests from a success message. |
| [Tool](https://ui.shadcn.com/docs/ai-elements/base/tool.md) | Action line with inputs, output, failure, or approval | Tool-call identity, lifecycle state, safe arguments/results | Highest fit: improve existing tool groups without dumping sensitive payloads. |

### Avoid overlapping abstractions

- **Plan:** future steps known in advance.
- **Task:** steps that appear as execution unfolds.
- **Queue:** an authoritative todo list split by status.
- **Chain of Thought:** an expandable summary of observable activity; separate from the Reasoning text pattern.
- **Tool/Subagent:** concrete activity inside those groups.

Do not show the same action as four independent rows simply because four patterns exist.

## Repository evidence: what exists today

| Area | Evidence | Interpretation |
| --- | --- | --- |
| Outer thread | `apps/web/components/chat/chat-thread.tsx:181–217,294–310` | Renders grouped runs; consecutive assistant messages can form one visible reply. Preserve resumed-turn behavior. |
| Turn rendering | `apps/web/components/chat/chat-message.tsx:44–175,247–260` | Renders grouped text/tools/subagents/questions; memoization depends on message updates. |
| Main presentation filter | `apps/web/lib/games/tool-parts.ts:332–390` | `groupParts` handles tool and text parts; other part types are ignored in this path. Parent spot-check confirmed the early return for non-text/non-tool parts. |
| Tool presentation | `apps/web/components/chat/tool-group.tsx:35–145` | Existing grouping, labels, status, and errors; a natural Trace adapter seam. |
| Subagent presentation | `apps/web/components/chat/subagent-entry.tsx:72–112`; `subagent-panel.tsx`; `subagent-run-detail.tsx` | Inline activity already exists alongside deeper inspection. Improve rather than remove it. |
| Activity primitives | `packages/ui/src/components/trace.tsx:12–161`; `message.tsx:14–55`; `bubble.tsx:44–85` | Message/Bubble are used; Trace was found in the workspace but not used in chat. |
| User-installed files | `packages/ui/src/components/code-block.tsx`; `apps/web/hooks/use-highlighted-code.ts`; `apps/web/lib/highlighter.tsx` | Present as untracked files during research. Preserve these and the user's package/lockfile changes. Installation provenance is not inferred beyond the user's report. |
| Subagent snapshots | `apps/web/lib/games/harness/run-subagent.ts:402–425,482–555` | Activity, steps, tool calls, edits, usage, prompt, and summary are already available in bounded records. |
| Subagent event reduction | `apps/web/lib/games/harness/run-subagent.ts:462–477` | Reasoning/source/file stream parts are skipped rather than forwarded into progress records. |
| Subagent record contract | `apps/web/lib/games/harness/records.ts:142–178`; `envelope.ts:24–45,55–72` | Player-facing records and model-facing envelopes differ. Records intentionally do not preserve every child event. |
| Reasoning accounting | `apps/web/lib/ai/message-meta.ts:29–40,97–114` | Reasoning-token counts exist; readable reasoning is not established by these counters. |
| Orchestrator model | `apps/web/lib/ai/agent.ts:7–18`; `model-registry.ts:40–49,76–100`; `apps/web/trigger/chat.ts:886–898` | Tier strong-slot routing through Google Vertex/Gemini settings, with possible fallbacks. Actual reasoning exposure must be checked against the installed adapter/provider and runtime. |
| Orchestrator stream boundary | `apps/web/trigger/chat.ts:873–898,975–1008` | Returns `streamText` through Trigger integration. No app-authored `sendReasoning`/`sendSources` configuration found; this does not prove the adapter defaults. |
| Persistence | `apps/web/lib/games/thread.ts:29–34,44–60`; `apps/web/trigger/chat.ts:668–671,824–834` | UI messages and resume cursor are stored. App transforms do not appear to strip reasoning/tool parts; `data-game-progress` is deliberately removed. |
| Transient progress | `apps/web/components/chat/use-game-chat.ts:94` and its `onData` handling; `apps/web/trigger/chat.ts:748` | Some progress goes to transient UI/callbacks rather than durable message content. Decide intentionally which milestones belong in history. |
| URL safety precedent | `apps/web/components/chat/markdown.tsx:38–55` | Existing HTTP URL checks and safe link attributes should inform sources/citations. |

Line references are research locators and may move with subsequent edits. This inspection did not execute the application, query private stored conversations, or assert runtime payloads from static types alone.

## Information availability and loss boundaries

### Available enough for a first presentation slice

- Existing orchestrator tool calls and their recognized lifecycle states.
- Subagent run status, activity summaries, tool/edit snapshots, and final summaries.
- Existing text, questions, usage metadata, and thread grouping.

These support richer Tool/Subagent Trace compositions without first adding a new model capability. Exact fields still require a display/redaction policy.

### Potentially present but not rendered

`groupParts` ignores reasoning, sources, and unknown non-text/non-tool parts. If the orchestrator adapter already forwards and persists these, the problem is partly a renderer gap. Static inspection cannot confirm their presence in a real run.

### Deliberately reduced or not established

- Subagent reasoning/source/file parts are skipped; simply changing JSX cannot recover them.
- Bounded/throttled subagent records are not full chronological transcripts. Decide which meaningful milestones to retain before promising “no information loss.”
- Source-producing tools, claim-to-source mappings, live terminal output, structured test suites, and authoritative plans/todos were not established as complete usable contracts.
- Trigger's injected compaction changes model context preparation, but its exact effect on persisted/UI messages was not verified. Do not equate context compaction with deletion of visible history.
- Dynamic-tool handling is not proven: current grouping uses `isToolUIPart`, while local types admit static and dynamic tools. Verify installed SDK guards before extending support.

### Reasoning verification gate

Before implementing Reasoning, inspect the installed Trigger/AI SDK stream adapter and one sanitized representative runtime/persisted message. Establish:

1. Whether the chosen model/provider returns displayable reasoning text or summaries.
2. Whether the stream adapter forwards that content and with which options.
3. Whether it reaches UI messages, survives completion/reload/resume, and is filtered only by rendering.
4. Whether a subagent capability change is needed separately.

Only display content explicitly exposed by the provider and appropriate for the user. Do not infer or fabricate hidden reasoning. If unavailable, show observable activity summaries instead.

## Streaming and interaction rules worth retaining

- Stable data-part IDs update a single Plan/Task/Terminal item in place; they should not append duplicate rows on each delta.
- Terminal output must be correlated with its tool-call ID. A final tool result is not a live output stream.
- Preliminary subagent output is still running, even when its tool state is `output-available`. Completion must consider preliminary/final semantics.
- Tool status needs explicit mapping for input streaming, ready input, approval requested/responded, output, denial, and error. Waiting for input/approval is not execution.
- Queue should use the latest complete todo input, not partially streamed JSON.
- Automatic open/close behavior must yield to the user's explicit expansion choice (`open ?? running` pattern).
- Reasoning duration is not provided automatically by the SDK; measure it if needed rather than inventing timing.
- Trigger semantics, keyboard behavior, screen-reader announcements, reduced motion, safe links, and stable scroll anchoring remain acceptance concerns.
- Long detail can live in a Sheet/inspector. More visibility does not require expanding every output by default.

## Suggested adoption sequence — for discussion only

| Slice | Why first / prerequisite | Candidate outcome |
| --- | --- | --- |
| 1. Existing Tool + Subagent information | Highest value with already available data | Consistent Trace activity, meaningful labels/status, expandable safe detail, existing inspector preserved. |
| 2. Ordered activity and durable milestones | Prevent important progress from disappearing or being duplicated | Explicit rendering contract and intentional transient-versus-durable policy; preserve existing text/question order. |
| 3. Reasoning capability check | Highly desired but unproven data path | Verified displayable reasoning path, or clear fallback to observable activity. |
| 4. Plans/tasks and verification | Needs real producer/state semantics | Task/Plan or Test Results only where corresponding structured events exist. |
| 5. Sources and citations | Needs trusted source payloads and attribution | Deduped source list first; inline citations only with supported claim associations. |
| 6. Optional supporting patterns | Product value must justify complexity | Context, file tree, suggestions, terminal, checkpoints, and approvals selectively, not a wholesale catalog installation. |

## Proposed acceptance criteria for later implementation

These are questions/checks to settle in a future implementation plan, not completed work.

- [ ] Document which event fields are emitted, retained, persisted, and rendered; distinguish missing data from hidden data.
- [ ] Preserve chronological text/activity order, stable identities, and resumed assistant-run grouping.
- [ ] Show running, preliminary, completed, failed, denied, and waiting states accurately without duplicate entries.
- [ ] Define durable milestones and bounded retention; do not blindly persist every token/delta or promise unlimited logs.
- [ ] Keep live and reloaded thread representations consistent for information designated durable.
- [ ] Respect manual collapse choices and scrolling while streaming updates arrive.
- [ ] Keep subagent detail navigation and existing question interaction working.
- [ ] Redact secrets, internal prompts, sensitive tool arguments/results, private paths, and raw server errors as appropriate.
- [ ] Validate source URLs and avoid unsupported inline attribution.
- [ ] Verify reasoning availability and lifecycle with observed runtime evidence before presenting it as supported.
- [ ] Add focused grouping/state/persistence tests plus component/browser checks for stream updates, accessibility, and scrolling.

Relevant existing tests include `apps/web/lib/games/tool-parts.test.ts`, `apps/web/lib/games/harness/records.test.ts`, and `apps/web/lib/games/build-progress.test.ts`. Exploration found no direct component tests for ChatMessage, ChatThread, ToolGroup, or Trace. No functional tests/build/browser checks were run: this change is research documentation only, and no application behavior was modified.

## Next discussion

Agree on the first observable outcome, not on adopting every pattern. Recommended starting point: **make existing tool and subagent work legible inside each turn, retaining detail on demand**, then resolve the reasoning pipeline and durable-progress gaps. The user has requested analysis first; no implementation, dependency installation, commit, database operation, or deployment is authorized by this document.
