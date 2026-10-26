"use server"

import { db } from "@workspace/db"
import { promptImprovements, userSettings } from "@workspace/db/schema"
import { generateText } from "ai"
import { and, count, eq, gte, sql } from "drizzle-orm"
import { z } from "zod"

import { resolveUtilityModel } from "@/lib/ai/model-registry"
import {
  capturePricingSnapshot,
  turnCostMicroUsd,
  turnCreditCost,
  turnUsageTokens,
} from "@/lib/ai/pricing"
import {
  improverAllowance,
  utcDayStart,
  type ImproverAllowance,
} from "@/lib/games/improver/allowance"
import { runImprovement, type ImproveOutcome } from "@/lib/games/improver/flow"
import {
  cleanImprovedText,
  improverInstructions,
  improverTemplateContext,
} from "@/lib/games/improver/instructions"
import { getTemplate, templateIdSchema } from "@/lib/games/templates/catalog"
import { readTemplateContract } from "@/lib/games/templates/seed"
import { ingestImprovementCredits } from "@/lib/polar/events"
import { readCustomerState, summarizeBillingState } from "@/lib/polar/plan"
import { requireSession } from "@/lib/session"

const MAX_INPUT_CHARS = 4000

const improveInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_INPUT_CHARS),
  templateId: templateIdSchema,
  mode: z.enum(["new", "change"]),
})

export type ImproveResult =
  | ImproveOutcome
  | { ok: false; error: "invalid"; allowance: ImproverAllowance }

type Executor = Pick<typeof db, "select">

async function countToday(executor: Executor, userId: string, now: Date) {
  const [used] = await executor
    .select({ value: count() })
    .from(promptImprovements)
    .where(
      and(
        eq(promptImprovements.userId, userId),
        gte(promptImprovements.createdAt, utcDayStart(now))
      )
    )

  return used?.value ?? 0
}

/**
 * The plan and balance from Polar and the overage opt-in, read fresh on every
 * call. The browser's idea of any of these is never trusted — an action is a
 * public endpoint.
 */
async function readAccount(userId: string) {
  const [state, [settings]] = await Promise.all([
    readCustomerState(userId),
    db
      .select({ overageBilling: userSettings.improverOverageBilling })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1),
  ])
  const { plan, balance } = summarizeBillingState(state)

  return { plan, balance, overageBilling: settings?.overageBilling ?? false }
}

async function readQuotaState(userId: string, now: Date) {
  const [account, usedToday] = await Promise.all([
    readAccount(userId),
    countToday(db, userId, now),
  ])

  return { ...account, usedToday }
}

/** The button's state for its tooltip, read when the composer mounts. */
export async function readImproverAllowance(): Promise<ImproverAllowance> {
  const { user } = await requireSession()
  const now = new Date()

  return improverAllowance({ ...(await readQuotaState(user.id, now)), now })
}

/**
 * Rewrites the composer's text into a solid prompt. Inside the quota the call
 * is free; beyond it, with the overage opt-in, it is priced exactly like a
 * turn (`turnCreditCost`) and metered to Polar from its ledger row.
 *
 * The quota check and the ledger claim run in one short transaction holding
 * `pg_advisory_xact_lock` on the user, so parallel calls are counted one after
 * another; see `runImprovement`.
 */
export async function improvePrompt(input: {
  text: string
  templateId: string
  mode: string
}): Promise<ImproveResult> {
  const { user } = await requireSession()
  const now = new Date()

  const parsed = improveInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      allowance: improverAllowance({
        ...(await readQuotaState(user.id, now)),
        now,
      }),
    }
  }

  const { text, templateId, mode } = parsed.data
  const { model, primary } = resolveUtilityModel("improve")
  const snapshot = capturePricingSnapshot(now)

  return runImprovement({
    now,
    readAccount: () => readAccount(user.id),
    withUserLock: (fn) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`prompt-improver:${user.id}`}))`
        )

        return fn({
          countToday: () => countToday(tx, user.id, now),
          claim: async () => {
            const [row] = await tx
              .insert(promptImprovements)
              .values({
                userId: user.id,
                templateId,
                modelId: primary.id,
                costMicroUsd: 0,
                rateVersion: snapshot.rateVersion,
              })
              .returning({ id: promptImprovements.id })
            if (!row) throw new Error("The improvement claim was not recorded")

            return row.id
          },
        })
      }),
    generate: async () => {
      const template = getTemplate(templateId)
      const contract =
        templateId === "none"
          ? undefined
          : await readTemplateContract(template.id, template.version)
      const context = improverTemplateContext(
        contract && {
          label: template.label,
          tagline: template.tagline,
          models: contract.manifest.models,
        }
      )
      const { text: reply, usage } = await generateText({
        model,
        providerOptions: primary.providerOptions,
        instructions: context
          ? `${improverInstructions(mode)}\n\n${context}`
          : improverInstructions(mode),
        prompt: text,
      })

      return { text: cleanImprovedText(reply), usage }
    },
    settle: async (claimId, { usage }, charged) => {
      const credits = charged
        ? turnCreditCost({ modelId: primary.id, usage, snapshot })
        : 0
      await db
        .update(promptImprovements)
        .set({
          ...turnUsageTokens(usage),
          costMicroUsd: turnCostMicroUsd({ modelId: primary.id, usage, snapshot }),
          credits,
        })
        .where(eq(promptImprovements.id, claimId))

      return credits
    },
    release: async (claimId) => {
      await db
        .delete(promptImprovements)
        .where(eq(promptImprovements.id, claimId))
    },
    ingest: ({ claimId, credits }) =>
      ingestImprovementCredits({
        userId: user.id,
        improvementId: claimId,
        credits,
        modelId: primary.id,
      }),
    markIngested: async (claimId) => {
      await db
        .update(promptImprovements)
        .set({ creditsIngestedAt: new Date() })
        .where(eq(promptImprovements.id, claimId))
    },
    log: (message, error) => console.error(message, error),
  })
}
