<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
