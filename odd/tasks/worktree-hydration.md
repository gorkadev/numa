# Feature: Worktree hydration for Herdr

## Objective

Every Herdr-created Git worktree of this repository starts fully usable: AI skills,
registries, persona config, and environment files already present, and dependencies
installed — without manual copying from the primary checkout.

## Problem

`.gitignore` excludes the developer-local assets that agents depend on:

```
.atl  .agents  .claude  .pi  .codegraph  .neon  .env*
```

A Git worktree only materializes tracked files, so a fresh worktree has none of them.
The primary checkout at `/Users/gorka/workspace/numa` does. Every new worktree therefore
starts with no project skills, no skill registry, no persona, no `.env.local`, and no
`node_modules`.

A second, independent defect: six Better Auth skills were installed under
`apps/web/.agents/skills` with symlinks in `apps/web/.claude/skills`, plus a nested
`apps/web/skills-lock.json`. Skill discovery runs from the repository root, so the
generated `.atl/skill-registry.md` contains zero references to `apps/web` — those six
skills were never available to any agent.

## Why

Skill discovery is rooted at the checkout top level. Anything that lives below a
workspace package is invisible. And anything that is gitignored does not survive a
`git worktree add`. Both defects silently degrade agent output instead of failing
loudly, which is why they went unnoticed.

## Scope

In scope:

- Move the six misplaced Better Auth skills to the repository root and make them
  discoverable.
- Add a Herdr plugin that hydrates a new worktree from its source checkout on
  `worktree.created` and `worktree.opened`.
- Document the mechanism.

Out of scope:

- Tracking `.agents`, `.claude`, `.atl`, `.pi`, `.neon`, or `.env*` in Git.
- Replacing the `skills` lock workflow or reintroducing a skill installer dependency.
- Any product code under `apps/` or `packages/`.

## Constraints

- The plugin is generic: it discovers ignored content with Git, it does not hardcode a
  repository path or a fixed file list.
- Hydration never overwrites an existing file in the target worktree.
- Derived and heavy directories (`node_modules`, `.next`, `.turbo`, `.trigger`, build
  output, `coverage`, `.codegraph`) are never copied; dependencies are installed instead.
- The plugin must work offline for the copy phase.
- Zero runtime dependencies beyond Node.js and `git`.

## Tasks

- [x] 1. Move the six Better Auth skills from `apps/web/.agents/skills/` to
      `.agents/skills/`, recreate their `.claude/skills/` symlinks, merge
      `apps/web/skills-lock.json` into the root `skills-lock.json`, remove the tracked
      nested lock file and the now-empty `apps/web/.agents` and `apps/web/.claude`.
      Verify `.atl/skill-registry.md` resolves all six.
- [x] 2. Create `~/.config/herdr/plugins/worktree-hydrate/` with `herdr-plugin.toml`,
      `index.mjs`, and `README.md`. Herdr plugins are global to the user, so the plugin
      lives outside any single checkout and keeps working when a worktree is removed.
- [x] 3. Link the plugin with `herdr plugin link` and verify
      `herdr plugin list` reports no warnings.
- [x] 4. Verify hydration end to end against a scratch worktree.
- [x] 5. Hydrate this worktree with the plugin and confirm the skills are discoverable.

## Acceptance criteria

- `.atl/skill-registry.md` contains a row for each of the six Better Auth skills.
- `skills-lock.json` at the root contains all 31 skills and is the only lock file.
- `herdr plugin list` shows `numa.worktree-hydrate` enabled with no warnings.
- Hydrating a scratch worktree produces `.agents/skills`, `.claude/skills`, `.atl`,
  `.pi`, `.neon`, `apps/web/.env.local`, and `apps/web/design` with the same content as
  the source checkout.
- A second hydration run on the same worktree changes nothing and exits successfully.
- `.codegraph`, `.turbo`, `.next`, `.trigger`, and `node_modules` are never copied.
- The hydrated `.atl/skill-registry.md` points at the new worktree, not the source root.

## Checks

- `node --check tooling/herdr-worktree-hydrate/index.mjs`
- Manual hydration run against `/private/var/folders/.../hydrate-fixture` scratch worktree.
- `herdr plugin list --json` inspection for `warnings`.
- `git status --short` confirms only the intended tracked deletion.

## Delivery

- Delivery strategy: `single-pr` (small, self-contained tooling change).
- Forecast: ~350 authored changed lines including README and the plugin implementation.

## Progress

- Route: skills move inline (mechanical, fully understood); plugin files delegated to one
  bounded writer.

## Verification evidence

- `node --check index.mjs` → exit 0.
- No payload / no args → `[hydrate] skip: no worktree payload`, exit 0.
- Same source and target → `[hydrate] skip: primary checkout`, exit 0.
- Scratch hydration in an empty directory → `335 copied, 0 present, install skipped`;
  31 skills, 37 `.claude/skills` entries, 4 design images, `.env.local` byte-identical.
- Symlinks preserved as symlinks, no broken links in the hydrated tree.
- `.codegraph`, `.turbo`, `.next`, `.trigger`, `node_modules` absent from the hydrated tree.
- `.atl/skill-registry.md` rewritten: 37 target-path references, 0 source-path references.
- Second run against the same target → `0 copied, 335 present` (idempotent).
- `herdr plugin link` → `plugin_linked`, enabled, no `warnings` field;
  `herdr plugin list` → `numa.worktree-hydrate (Worktree Hydrate) enabled [local:...]`.
- Hydration of this worktree → `335 copied, 0 present, install ran`; `node_modules`
  present at the root and in `apps/web` and `packages/db`.
- Skill discovery confirmed: the six Better Auth skills now appear in the session skill
  list (`better-auth-best-practices`, `better-auth-security-best-practices`,
  `create-auth`, `email-and-password-best-practices`, `organization-best-practices`,
  `two-factor-authentication-best-practices`).
- Native review: `gentle-ai review mode status` → off (clone-local decision), so the
  review gate is `disabled/unmanaged` and ordinary checks apply.

## Review findings corrected

- The first implementation skipped an entire ignored directory when its target already
  existed, so a later-added skill never reached a partially hydrated worktree.
  Directories are now always reconciled and only files/symlinks are skipped when present.
- The notification child was spawned detached, which Herdr does not protect across
  plugin command exit. It is now a bounded synchronous call.

## Next step

- Plugin source is not versioned. Decide whether to publish it or move it into a
  dotfiles repository.
- `.claude/skills` holds six `trigger-*` directories that exist only there, without a
  matching `.agents/skills` counterpart. Not a discovery bug, but it breaks the
  one-directional convention documented above.
