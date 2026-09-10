import {
  boolean,
  index,
  integer,
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

    /**
     * The Daytona sandbox that hosts this game's files — one sandbox per game,
     * created on the chat's first turn.
     *
     * Nullable because the row exists before the sandbox does: `createGame`
     * writes the game, and the chat agent provisions the sandbox when the
     * conversation actually starts. A null here means "not provisioned yet",
     * which is also what a failed provision leaves behind — so read it as a
     * hint, and confirm with Daytona before trusting the sandbox is alive.
     */
    sandboxId: text("sandbox_id"),

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

/**
 * One row per completed chat turn: what it spent, and what that is estimated to
 * have cost. Append-only — nothing in the application updates or deletes a row
 * here, because the question this table answers is historical ("what did this
 * game cost to build?") and a mutable answer to that is worth nothing.
 *
 * This is measurement, not billing. No price is charged from these numbers and
 * no access is gated on them; they exist so the real cost-per-game can be
 * learned from production before anything is priced on a guess.
 */
export const turnUsage = pgTable(
  "turn_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * The game this turn belonged to — deliberately *not* a foreign key.
     *
     * Both available referential actions are wrong here. `restrict` would make
     * the ledger block the app's delete-game feature, so a player could not
     * remove their own game once it had cost anything. `cascade` would erase
     * the cost record along with it, which is worse: the money was really
     * spent, and a deletion in the product does not un-spend it.
     *
     * So the ledger outlives the game it describes, and a lookup against
     * `games` is allowed to find nothing. Read this as an identifier, not as a
     * relation.
     */
    gameId: uuid("game_id").notNull(),

    /**
     * Copied from `games.orgId` at write time rather than joined for.
     *
     * Denormalized for the same reason the game id is not a key: this is the
     * boundary anything is ever eventually billed to, and it has to survive the
     * game's deletion. Resolving the org through `games` at read time would
     * make every deleted game's spend fall out of its organization's total —
     * silently, and only for the orgs that delete things.
     */
    orgId: text("org_id").notNull(),

    modelId: text("model_id").notNull(),

    /** The turn's 0-indexed position within its chat, as `onTurnComplete`
     * reports it. Ordering, not identity: a retried run can repeat a number. */
    turn: integer("turn").notNull(),

    /**
     * The Trigger.dev run that produced the turn. Kept so a surprising row can
     * be opened in the dashboard and read against the run's actual steps —
     * which is the only way to reconcile an estimate here with what the
     * provider really did.
     */
    runId: text("run_id").notNull(),

    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),

    /**
     * The turn's ESTIMATED cost, in millionths of a USD.
     *
     * Integer micro-dollars rather than a float or a numeric, because money
     * summed over thousands of rows must not accumulate binary rounding error —
     * and because the unit has to be small enough that a single cheap turn is
     * not rounded to zero cents.
     *
     * `int4` caps one row near $2,147, which `stopWhen: stepCountIs(25)` puts
     * comfortably out of reach of any single turn. Aggregates are safe too:
     * Postgres widens `sum(int4)` to `bigint`, so a rollup cannot overflow the
     * column's own type.
     */
    costMicroUsd: integer("cost_micro_usd").notNull(),

    /**
     * Which version of the in-repo rate table produced `costMicroUsd`.
     *
     * This is what makes the number auditable instead of merely stored. Rates
     * change on schedules nobody controls — Gemini 3.8 Flash doubles on
     * 2027-01-01 when its introductory pricing ends — so without knowing which
     * rates were in effect, a row's estimate can never be re-derived, explained
     * to anyone, or corrected in bulk once a rate turns out to have been wrong.
     */
    rateVersion: text("rate_version").notNull(),

    /**
     * How many credits this turn consumed — the customer-facing unit, stored
     * rather than derived from `cost_micro_usd` on read.
     *
     * The conversion is not a constant of nature. It is a markup somebody
     * chose, and it will be chosen differently at some point. Recomputing this
     * number later would apply today's markup to a turn that was sold under
     * yesterday's, silently rewriting how much every historical turn cost the
     * customer — including turns already paid for. A row has to stay
     * explainable with the economics that were in force when it was written,
     * and the only way that holds is if the answer is written down.
     *
     * `rate_version` covers this too, and deliberately: the markup constant
     * lives in the same rate file as the per-model rates, so the version that
     * explains `cost_micro_usd` is the same version that explains this column.
     * There is no second version to keep in step.
     */
    credits: integer("credits").notNull().default(0),

    /**
     * When Polar accepted the usage event for this row, or null if it never
     * did. This is the repair handle.
     *
     * `credits > 0 and credits_ingested_at is null` is usage this application
     * charged for internally and never told Polar about — the exact query a
     * reconciliation job runs, and the exact set of rows it has to replay.
     * Without this column the ingest is fire-and-forget in the worst sense: a
     * failed call leaves behind a row indistinguishable from a successful one,
     * so the backlog is not merely unrepaired but unfindable. Nothing in the
     * system would ever surface it, and the money is simply gone.
     */
    creditsIngestedAt: timestamp("credits_ingested_at", { withTimezone: true }),

    /** Why the model stopped, when the provider said. Nullable because a turn
     * can complete without one — an aborted stream reports nothing. */
    finishReason: text("finish_reason"),

    /** Whether the player stopped this turn mid-generation. A stopped turn
     * still costs what it had already produced, so it is recorded, but it is
     * not comparable to one that ran to completion. */
    stopped: boolean("stopped").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Serves the rollup this table exists for: one organization's spend over a
     * window, newest first. The leading `org_id` also covers a plain
     * `where org_id = ?` total, so no second index is warranted for it.
     */
    index("turn_usage_org_id_created_at_idx").on(
      table.orgId,
      table.createdAt.desc()
    ),

    /**
     * Serves the other question — what one game cost — which is a scan of every
     * turn it ever ran. Separate from the index above because `org_id` does not
     * prefix it: a game's rows are a narrow slice of its org's, and reaching
     * them through the org index would read the whole organization's history to
     * throw nearly all of it away.
     */
    index("turn_usage_game_id_idx").on(table.gameId),
  ]
)

export type TurnUsage = typeof turnUsage.$inferSelect
export type NewTurnUsage = typeof turnUsage.$inferInsert
