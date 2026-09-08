import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * Drizzle owns the schema for this database. Change a table here, then run
 * `pnpm db:push` to reconcile the branch against this file. Migration files are
 * not used while the project is in development — see AGENTS.md. Never issue ad
 * hoc DDL against a branch: a change that is not in this file is a change no
 * other branch will ever receive.
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Clerk organization id (`org_…`). Every row is owned by exactly one org
     * and every query must filter on it — this is the tenant boundary, so a
     * missing predicate leaks another organization's games.
     */
    orgId: text("org_id").notNull(),

    title: text("title").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * `$onUpdate` is applied by Drizzle on write, not by Postgres, so it only
     * fires for updates that go through Drizzle. Raw SQL against the branch
     * will leave this stale.
     */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    /**
     * Serves the app's dominant read: one organization's games, newest first
     * (the sidebar's "Recents"). The leading `org_id` column also makes this
     * usable for a plain `where org_id = ?`, so no separate single-column
     * index is warranted.
     */
    index("games_org_id_created_at_idx").on(
      table.orgId,
      table.createdAt.desc(),
    ),
  ],
)

export type Game = typeof games.$inferSelect
export type NewGame = typeof games.$inferInsert
