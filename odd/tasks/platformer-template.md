# Platformer template

Objective: ship `platformer@1`, a starter kit built from the Quaternius "Platformer Game Kit - Dec 2021" glTF files, with a TEMPLATE.md that teaches the agent what it cannot infer.
Branch: `feat/platformer-template`. Delivery: ask-on-risk, forecast ~350 authored lines (excluding generated ASSETS.json and asset bytes). Runner: `pnpm --filter web exec tsx --test <file>`.

## Specs

- S1 Assets: glTF only from the source pack, no duplicates ("como siempre, nos quedamos con el formato de assets q a nosotros nos interesa: gltf"). Bytes live in R2 behind `ASSETS.lock.json` like the other kits.
- S2 Manifest metadata the agent needs: categories that separate platforms, hazards, mechanisms and pickups; an `interact` animation category; per-model bounds (min/max, after node transforms) so the agent can place and scale without guessing. Additive and optional, existing kits unchanged.
- S3 TEMPLATE.md documents: 2-unit grid, origins, character scale, the four modular platform systems and their rotation convention (verified by rendering), no built-in physics (collide against a logical tile grid), exact clip names of animated props.
- S4 Default example is a 2.5D side-scroller ("2.5D scroll lateral"): run, jump, collect coins, stomp an enemy, reach the goal flag, reset. Example only, not a restriction.
- S5 No game-shape verification contract (lesson from fantasy-cards); the common readiness policy applies.
- S6 Registered in the catalog, seed registry and both locales; tests pin registration, lock completeness and source fidelity like toon-shooter.

## Tasks

- T1 S2 inline — schema categories + bounds + inventory rendering — done, a7b6724 (RED 3 fail → GREEN 21 pass)
- T2 S1,S2 inline — generate mirror + ASSETS.json from the source pack — done, 05361aa (109 models, 111 files, 6.28 MB)
- T3 S3 inline — render-verify the tile rotation convention — done (browser render, no commit: evidence in Log)
- T4 S3,S4,S5,S6 inline — TEMPLATE.md, registration, i18n, tests, R2 push + lock — done, 05361aa (RED 7 fail → GREEN 41 pass)
- T5 S4 — smoke test: generate a real game with the template — done (game fafc95b1 "Skyward Coin Caper", run_06go03fclvbknctkej0iup7la2)

## Log

- L1 (2026-10-28, user): "2.5D scroll lateral, dale con la implementación" — after the design proposal: platformer@1 with glTF only, dedupe, schema categories platform/hazard/mechanism/pickup + interact + per-model size, TEMPLATE.md with grid/origins/scale/tile systems/rotation/no physics/clip names, 2.5D example with ≤6 eager models, no rigid verification contract.
- L2: Exploration: templates = seed/{TEMPLATE.md, ASSETS.json, ASSETS.lock.json, vendor loaders} + `seed.ts` registry + `catalog.ts` + messages/{en,es}.json; assets pushed with `pnpm template-assets push <id>` from `.template-assets/<id>/`. No DB change (`games.template_id` is text).
- L3: T2 import: Single Cube folder skipped (byte-identical to Cubes/*_Single); `Stairs.gltf` is a ladder → mechanism. Bounds after node transforms; skinned meshes in bind space.
- L4: T3 render evidence: Single-Height 5x3 seamless with Side overhang +Z (rot 0/+π/2/π/−π/2 for +Z/+X/−Z/−X) and Corner overhang −X,+Z; 2D row seamless with 1x1End at left (0) and right (π). Characters face +Z (+π/2 faces right). Plain `clone()` of skinned models renders at the original's position — SkeletonUtils.clone required.
- L5: T4 checks: template tests + related 41 pass; `tsc --noEmit` clean; eslint 0 errors (warnings only in vendored three loaders and pre-existing asset-lock env var); diff --check clean. `pnpm template-assets push platformer`: 111 blobs uploaded, lock written; live `readGameSeed("platformer", 1)` downloaded and verified 111 files.
- L6: T5 smoke test. Prompt (no hints): "A cheerful platformer: run and jump across floating islands, collect coins, stomp enemies and reach the flag." Agent read ASSETS.json and built a 2.5D side-scroller in one turn (9 steps, 296k tokens): seamless 2D grass rows on rock mesas, player facing travel direction, spinning coins, HUD (lives/coins/score), keyboard + touch, game over/restart. Deterministic browser check: no findings. Separate issue, not template-related: the Tester sub-agent (Gemini 4 Argon) failed with 0 tokens and no tool calls (provider call never produced output); the final reply then said verification was unavailable.
