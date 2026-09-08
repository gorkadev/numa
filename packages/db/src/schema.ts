import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import type { UIMessage } from "ai"

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

    /**
     * The game's entire chat thread, stored in the AI SDK's `UIMessage` shape —
     * the format `useChat` renders and posts — so a turn is a whole-document
     * rewrite rather than an append to a messages table. One game owns exactly
     * one thread, which is why this is a column and not a relation.
     *
     * `$type` is a compile-time assertion only: Postgres validates nothing
     * beyond "this is JSON", so anything read back from an older shape must be
     * treated as untrusted until validated.
     */
    messages: jsonb("messages").$type<UIMessage[]>().notNull().default([]),

    /**
     * The Trigger.dev chat Session backing this game's thread, as the browser
     * needs it back on page load. The Session outlives the runs it schedules,
     * so a tab opened tomorrow reconnects to the same conversation instead of
     * creating a second one.
     *
     * `chat_access_token` is the session-scoped PAT the transport authenticates
     * with; it expires, and the transport mints a fresh one through the
     * `mintChatAccessToken` action when it does, so a stale value here is a
     * round trip rather than a failure.
     */
    chatAccessToken: text("chat_access_token"),

    /**
     * Cursor into the Session's durable response stream. This is what replaces
     * stream-resumption plumbing: on reload the transport resubscribes from
     * here, so chunks already rendered are not redelivered and an in-flight
     * turn continues streaming.
     *
     * Written in the same statement as `messages` on purpose — a reload
     * between the two writes would resume from a stale cursor and render the
     * assistant's reply twice. It is keyed to the Session, not to a run, so it
     * is never cleared when a run ends.
     */
    lastEventId: text("last_event_id"),

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
      table.createdAt.desc()
    ),
  ]
)

export type Game = typeof games.$inferSelect
export type NewGame = typeof games.$inferInsert
