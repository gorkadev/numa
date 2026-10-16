# Toon Shooter gamekit

## Objective
Integrate the complete glTF content of `/Users/gorka/Downloads/Games/Toon Shooter Game Kit - Dec 2022/` using the existing fantasy-cards and cube-world conventions.

## Scope and constraints
- User selected the complete glTF pack, including referenced dependencies; exclude duplicate Blender, FBX and OBJ representations.
- Preserve source asset content and attribution evidence. No license file was located; record unknown licensing honestly rather than inventing permission.
- Follow existing seed descriptors, manifests, provisioning, picker and localization conventions. No DB changes.
- Do not commit, push or open a PR without explicit user request. Commit evidence is therefore pending authorization.
- One delegated writer; no parallel writes.
- Delivery strategy: ask-on-risk; forecast 150–300 authored lines excluding copied/generated asset inventory and model data. Reassess actual scope if necessary.

## Tasks
- [x] T1 (done): Integrated complete glTF assets, manifest, template instructions, registration, localization and regression tests. Route: gentle-ai-worker; multi-file and preparation triggers. RED observed (2 passed, 4 failed); GREEN 6 passed. No commit: explicit authorization absent.
- [x] T2 (done): Assessment and independent verification completed. Route: gentle-ai-verify; assessment unassessable due to untracked-file declaration, conservatively treated as high. RDD off. Independent verifier PASS with no blocking findings; no commit authorized.

## Acceptance criteria
- Toon Shooter appears alongside existing kits and resolves to a valid versioned seed.
- All glTF models from the source pack are represented; referenced local buffers/textures resolve and are declared according to existing conventions.
- Tests protect inventory, registration and dependency completeness as appropriate.
- Existing kits are unchanged in behavior.

## Verification
- Writer must inspect package scripts and use the actual supported runner (explorer suggested `pnpm --filter web exec tsx --test lib/games/templates/inventory.test.ts`).
- Run focused tests RED/GREEN and relevant existing template tests, typecheck and lint on authored code where supported.
- Read relevant installed Next.js guides before code changes.
- Browser verification: determine applicability; no fabricated browser evidence.

## Evidence and next step
- Read-only exploration identified source folder and existing seed/catalog conventions.
- Working tree initially clean; current branch master.
- Writer reports 74 embedded glTF models (3 characters, 55 environment, 16 guns), 11,894,462 model bytes; seed 78 files / 12,038,576 bytes, including two unchanged existing loaders. Approximately 155 authored lines excluding generated/copied content.
- Writer checks passed: focused template tests (6), `pnpm --filter web exec tsc --noEmit --incremental false`, focused ESLint and `git diff --check`.
- Browser/rendering and production build/deployment not performed.
- Engram mirror readback unavailable: tool validation requests an `id` field incompatible with exposed `observation_id` schema; saved mirror exists but readback is pending.
- Independent verifier PASS: 6/6 tests; TypeScript, focused ESLint and diff check passed. Read-only source audit confirms 74/74 byte-identical glTF files, complete embedded dependency closure, all 51 animation names, unchanged loader bytes and correct manifest hashes. Existing inventory regressions passed. No additional directly related tests found.
- Final authored scope approximately 145 changed lines excluding generated/assets (182 with initial task record); below delivery heuristic.
- Limitations: browser picker interaction, WebGL rendering and sandbox provisioning not verified; production build/deployment and fresh upstream loader downloads not run. Node tests emitted deprecation warnings only. Native risk assessment unavailable; compensated with independent verification, not native approval.
- Next: browser/sandbox smoke test of selecting Toon Shooter and loading a generated scene. Changes remain uncommitted and unpublished.
