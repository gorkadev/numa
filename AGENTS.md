<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Local-only developer assets and worktrees

`.gitignore` excludes the assets agents depend on: `.agents/` (skills), `.claude/`
(skill symlinks), `.atl/` (generated skill registry), `.pi/` (persona), `.neon`,
`.env*`, and `apps/web/design/`. A Git worktree only materializes tracked files, so
a fresh worktree starts without them.

**Agents: always create worktrees with this script**, in any terminal, never with a
bare `git worktree add` or the runtime's own worktree tool. The one exception is
inside Herdr, which uses `herdr worktree create` (see below). Create one when the user
asks, or propose it and wait for their confirmation:

```bash
node scripts/worktree.mjs <branch> [--base <ref>]   # base defaults to master
```

It creates `../numa-worktrees/<branch>`, restores the ignored assets from the primary
checkout, installs dependencies, and, inside Rex, opens a background tab named after
the branch in the current session (one Rex session per project; Rex has no worktree
support of its own). Wait for it to finish: it can take
minutes, a non-zero exit means the worktree is not ready, and the last line of stdout
is its path. Running it again for the same branch restores whatever is missing.
Tests: `node --test scripts/`.

**Rex naming, only when `REX_SESSION` is set: the session is the project, the tab is
the task.** The session stays named `numa`; never rename it, even when Rex's startup
notice says to. Name your own tab after the task instead, and rename it when the task
changes:

```bash
rex window rename "$(rex block inspect "$REX_BLOCK" --json | jq -r '.block.window_id')" <task>
```

Use two to four lowercase words joined by hyphens.

Inside Herdr, use `herdr worktree create` so Herdr manages the worktree; a plugin
restores the assets on `worktree.created` and `worktree.opened`:

```bash
herdr plugin list                      # numa.worktree-hydrate
herdr plugin action invoke numa.worktree-hydrate.hydrate
herdr plugin log list --plugin numa.worktree-hydrate
```

It lives at `~/.config/herdr/plugins/worktree-hydrate/`. It inventories ignored
content with `git status --ignored=matching` and copies whatever is missing, so
newly ignored paths are covered without editing the plugin. Build output, caches,
`.codegraph`, and `node_modules` are never copied; dependencies are installed instead.
`.atl/skill-registry.md` is path-rewritten to the new worktree.

Skills belong at the repository root, in `.agents/skills/<name>/` with a
`.claude/skills/<name>` symlink pointing at `../../.agents/skills/<name>`. Skills
nested inside a workspace package are never discovered.

# Database schema changes: use `db:push`, never `migrate`

This project is in active development. There is no deployed data to preserve and
no backwards compatibility to maintain, so versioned migration files are pure
overhead — they add review noise and a bookkeeping table for a guarantee nobody
is asking for yet.

**Apply schema changes with `pnpm db:push`.** It diffs `packages/db/src/schema.ts`
against the live Neon branch and applies the difference directly.

```bash
pnpm db:push
```

Forbidden while the project stays in this phase:

- `drizzle-kit generate` — do not author migration files.
- `drizzle-kit migrate` — do not apply them.
- Committing anything under `packages/db/drizzle/`.
- Creating or restoring the `drizzle.__drizzle_migrations` table.

Neither script is wired up. Do not add them back without being asked.

`schema.ts` remains the single source of truth: change the schema there, then
push. Never issue ad hoc DDL against a branch — a change that is not in
`schema.ts` is a change no other branch will ever receive.

`db:push` is destructive by nature. It can drop a column or a table to make the
database match the schema, and drizzle-kit will prompt when a change risks data
loss. Read the prompt.

## When to reintroduce migrations

Switch back to `generate` + `migrate` once real data exists that must survive a
deploy — the first production branch, or the first shared environment somebody
else depends on. At that point, replace this section rather than quietly mixing
the two workflows: `push` and `migrate` do not compose, because `push` applies
changes that no migration file records.
