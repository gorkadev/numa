# Chat voice controls

## Objective
Add Web Speech API controls to listen to message text and dictate into the controlled chat composer without automatic submission.

## Scope and constraints
- Message footer reads the visible grouped text; playback can be stopped and cleans up on unmount. No playback for empty text. Client-only browser access, capability fallback, accessible localized labels.
- The shared composer (thread and new-game entry) gains a microphone button next to send. Final recognized text appends to the existing draft; no speech callback submits. User edits remain intact; no speech activity after unmount. Unsupported browsers and microphone failures are handled gracefully. Input is not sent automatically.
- Keep en/es locale parity. No database, transport, or server changes. Use Web Speech API without external dependencies.
- Reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API and Next 16.2.6 local `use-client` guide.

## Plan and acceptance
- [x] V1 — Message playback. Route: delegated writer (multi-file: message actions and locale files). Add a speak/stop action to nonempty message footer, dispose utterance safely, show available/failure state. Check: `pnpm --filter web typecheck`, `pnpm --filter web lint`, manual browser speech scenario if available. Commit a focused work unit.
- [x] V2 — Composer dictation. Route: delegated writer (multi-file: composer and locale files). Provide microphone start/stop; append final transcription to controlled draft without submission; preserve typed edits, clean up and handle unavailable/error states. Check: `pnpm --filter web typecheck`, `pnpm --filter web lint`, manual browser mic scenario if available. Commit a focused work unit.

## Verification and recovery
- TDD: off (source `openspec/config.yaml`, `strict_tdd: false`, no test runner configured). Exact available checks: `pnpm --filter web typecheck`, `pnpm --filter web lint`. Runtime browser microphone/speaker needs a real browser and permission; record observed result or pending.
- Delivery strategy: ask-on-risk. Forecast: ~250 authored changed lines across both tasks, subject to honest adjustment. Branch: `feat/new-flow` (already feature branch). RDD: off (session configuration); no native START.
- Progress: V1 done (`700ab68`, `feat(chat): read messages aloud with speech synthesis`). V2 done (`df1b210`, `feat(chat): dictate into the composer without sending`). Each writer ran `pnpm --filter web typecheck` (passed) and `pnpm --filter web lint` (0 errors, 29 unrelated warnings); independent read-only verification per unit found no actionable issues, and `git diff --check` passed. Browser audio and microphone scenarios remain pending because no browser runtime/permission harness was available. Next: manual cross-browser playback and dictation check; no push or PR requested. Authored scope ~393 changed lines through V2, including task document.
