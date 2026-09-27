# Chat voice controls

## Objective
Use Web Speech API to read messages aloud and transcribe speech into the chat draft without automatic submission.

## Scope and constraints
- Speech synthesis reads the visible grouped message text; playback can be stopped and cleans up on unmount.
- The shared composer (chat thread and new-game entry) appends final recognized text to the existing draft. Stop keeps late final results; discard aborts only the current transcription and preserves the earlier draft. Sending always requires a separate action.
- While dictating, the composer shows the scrolling waveform, discard, stop and disabled send; model picker and textarea are not interactive. Keep the user's `AudioWave01FreeIcons` and `fadeEdges={true}` choices.
- Voice/model shortcuts are Control+Shift+D/M; Escape discards while listening. Tooltips show localized action text and platform-appropriate Kbd glyphs: Mac Control `⌃` versus Meta `⌘`, Shift `⇧`; non-Mac `Ctrl ⇧`.
- Keep English and Spanish messages in parity. No database, server or transport changes.

## Work units and evidence
- [x] V1 — Message playback. `700ab68` (`feat(chat): read messages aloud with speech synthesis`). Browser playback works per user report.
- [x] V2 — Initial dictation. `df1b210` (`feat(chat): dictate into the composer without sending`). The user later found the stop/result race; V3 supersedes that behavior.
- [x] V3 — Fix late final results and recording layout; extract recognition hook. Reuse live waveform (`058d01f`) and integrate it in chat (`0600b91`). The user confirmed the controls work on worktree port 3001.
- [x] V4 — Ctrl+Shift+D voice toggle, Escape discard, Ctrl+Shift+M model picker, localized tooltips and Kbd. `0600b91`; user confirmed shortcuts work on port 3001.
- [x] V5 — Unify visible shortcut glyphs with account and sidebar hints. `0600b91`. Glyph rendering was not separately browser-tested after the last display-only edit.

## Verification and delivery
- TDD: off (`openspec/config.yaml`, no configured test runner).
- `pnpm --filter web typecheck`: passed. `pnpm --filter @workspace/ui typecheck`: passed. `pnpm --filter web lint`: passed, 0 errors and 29 warnings in unrelated files. `git diff --check`: passed before commits. Independent read-only audits inspected V3–V5. No lifecycle mock harness was run; browser success for V3/V4 is the user's report, not an agent-run test.
- Branch: `feat/new-flow`. RDD: off (clone-local session policy); no native review START. User explicitly authorized commit and push of all voice changes, choosing multiple work-unit commits with accepted size exceptions. Unit 1 `058d01f` is the pre-existing user-owned live waveform (~589 added lines); unit 2 `0600b91` is the cohesive web integration (~718 changed lines), including this feature document. These units exceed the ~400-line review heuristic because splitting them further would create a broken intermediate integration. No PR requested.
- Push to `origin/feat/new-flow`: pending; verify remote ref after publication.
