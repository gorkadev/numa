# Legacy Fantasy template (second 2D template)

Objective: ship `legacy-fantasy@1` from anokolisa's "Legacy-Fantasy - High Forest 2.3" pack on the existing 2D engine profile, the same way `tiny-swords@1` shipped.
Branch: `feat/legacy-fantasy-template`. Delivery: ask-on-risk, forecast ~600 authored lines (excluding generated ASSETS.json, lock and asset bytes). Runner: `pnpm --filter web exec tsx --test <file>`.

## Specs

- S1 `legacy-fantasy@1` assets: every useful PNG of the pack (no `.aseprite`, no `.gif` previews, no duplicate combined sheet `Mob/Snail/all.png`), bytes in R2 behind `ASSETS.lock.json`, `LICENSE.txt` with the license evidence. License: user confirmed (2026-10-28) "si, lo tengo". Frame sizes verified by transparent-boundary checks, never inferred from image size.
  - Character: the pack's per-animation frames differ (64x80, 80x80, 96x80, 80x64, 64x64) and the body sits at a different x per sheet, so every character animation is repacked (assumption: modification allowed, as with Tiny Swords UI) into one common frame where hip x and ground y coincide, so one `anchor` serves all animations.
  - Mobs (boar in three colours, small bee, snail) keep their sheets.
  - Irregular atlases (`Tiles.png`, `Buildings.png`, `Props-Rocks.png`, `Tree-Assets.png`, `Hive.png`, `Interior-01.png`, `HUD/Base-01.png`, the five `Trees/*-Tree.png`) are cut into named single-frame sprites; terrain pieces that must tile ship as a 16 px tileset with verified tile names.
- S2 `TEMPLATE.md` for a side-view platformer: pixels per unit, anchors, layer order (sky, parallax, terrain, props, actors), a terrain example rendered and checked in a browser, gravity/jump guidance on the engine, and a default example game (assumption: a short side-scrolling forest platformer, example only).
- S3 Registration as with tiny-swords: catalog entry with `dimension: "2d"`, seed registry, both locales, template tests (identity, frame sizes, tile names, descriptor facts, lock covers every declared file).
- S4 Smoke test: a real game generated with the template.

## Tasks

- T1 S1 inline — generator (scratch), visual checks, ASSETS.json, LICENSE.txt, R2 push — done, 896d951
- T2 S2 inline — TEMPLATE.md + browser render of its code — done, 896d951
- T3 S3 inline — catalog, seed registry, locales, tests — done, 896d951 (RED: 6 fail "Unknown game template seed: legacy-fantasy@1" → GREEN 7 pass; suite 483/483)
- T4 S4 — smoke test game — pending

## Log

- L1 (2026-10-28, user): "ya hemos implementado tiny swords, te parece si hacemos lo propio con legacy fantasy? en mi carpeta downloads > games"
- L2 (2026-10-28, user): "si, lo tengo. intentamos implementarlo a ver si podemos hacerlo correctamente" (license confirmed).
- L3: Exploration. Pack is 40 PNG, 1.9 MB, side view. Verified frames: idle 64x80x4, run 80x80x8, attack-01 96x80x8, dead 80x64x8, jump-all 64x64x15 (jump-start = frames 0-3, jump-end = 12-14), boar 48x32 (idle 4, walk 6, run 6, hit 4) in base/white/black, bee 64x64x4 (fly, attack, hit), snail 48x32x8 (walk, hide, dead). Hip x (mean boot x) / ground y per character sheet: idle 31/63, run ~44/63, attack 51/63, dead 29/47, jump 28/63. The five `Trees/*-Tree.png` share one alpha mask (colour variants).
- L4: T1-T3 evidence (one commit, route inline: one behaviour, no writer trigger). Generator in the session scratchpad (Pillow venv; not committed, like tiny-swords): 271 sprites + `terrain/tiles.png` tileset + LICENSE.txt = 273 files, 513,325 bytes. Hero repacked into 112x80 frames, hip x 56, feet row 63 (anchor `[0.5, 0.2]`), every frame asserted unclipped and checked on a guide render. Stills cut by hand rects then trimmed; contact sheets checked by eye; fixes: chest-open rect, three rocks per band touching at a 1 px neck split, mushroom-7 top line, `wardrobe` renamed `door-boarded`. Push found 3 duplicate blobs: `buildings/rock-wall-1..3` are byte-identical to `props/mound-*` in the pack, so the rock walls were dropped. `Trees/Background.png` right part is two seamless 96 px strips (`forest-strip-dark/light`); `forest-dark/light` are 352 px tree groups, not seamless. Browser (local static server, real 2D engine files): terrain block seamless with cycled middle tiles, anchors on the surface, the TEMPLATE.md code block run verbatim: hero lands at y −9.5 grounded, runs, jumps the 4-tile gap and lands, camera follows; starter page renders, no console errors (one transient image-load `Event` on a first load, gone on reload, all URLs 200). `pnpm template-assets push legacy-fantasy`: grid validation passed, lock written; live `readGameSeed("legacy-fantasy", 1)`: 310 files, 273 assets, the 13 2D engine files. Planner context 34.9k chars (tiny-swords 50.9k). tsc and eslint clean. RDD: clone-local off. Risk: none (additive template; 3D goldens in dimension.test.ts still pass).
