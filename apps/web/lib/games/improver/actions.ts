"use server"

import { db } from "@workspace/db"
import { promptImprovements, userSettings } from "@workspace/db/schema"
import { generateText } from "ai"
import { and, count, eq, gte } from "drizzle-orm"
import { z } from "zod"

import { resolveUtilityModel } from "@/lib/ai/model-registry"
import {
  capturePricingSnapshot,
  turnCostMicroUsd,
  turnCreditCost,
  turnUsageTokens,
} from "@/lib/ai/pricing"
import {
  canImprove,
  improverAllowance,
  utcDayStart,
  type ImproverAllowance,
} from "@/lib/games/improver/allowance"
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
  | { ok: true; text: string; credits: number; allowance: ImproverAllowance }
  | { ok: false; error: "invalid" | "denied" | "failed"; allowance: ImproverAllowance }

/**
 * Everything the quota decision needs, read fresh on every call: the plan and
 * balance from Polar, today's uses from the ledger, and the overage opt-in.
 * The browser's idea of any of these is never trusted — an action is a public
 * endpoint.
 */
async function readQuotaState(userId: string, now: Date) {
  const [state, [used], [settings]] = await Promise.all([
    readCustomerState(userId),
    db
      .select({ value: count() })
      .from(promptImprovements)
      .where(
        and(
          eq(promptImprovements.userId, userId),
          gte(promptImprovements.createdAt, utcDayStart(now))
        )
      ),
    db
      .select({ overageBilling: userSettings.improverOverageBilling })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1),
  ])
  const { plan, balance } = summarizeBillingState(state)

  return {
    plan,
    balance,
    usedToday: used?.value ?? 0,
    overageBilling: settings?.overageBilling ?? false,
  }
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
 */
export async function improvePrompt(input: {
  text: string
  templateId: string
  mode: string
}): Promise<ImproveResult> {
  const { user } = await requireSession()
  const now = new Date()
  const quota = await readQuotaState(user.id, now)
  const allowance = improverAllowance({ ...quota, now })

  const parsed = improveInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid", allowance }
  if (!canImprove(allowance)) return { ok: false, error: "denied", allowance }

  const { text, templateId, mode } = parsed.data
  const charged = allowance.kind === "charged"

  try {
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

    const { model, primary } = resolveUtilityModel("improve")
    const { text: reply, usage } = await generateText({
      model,
      providerOptions: primary.providerOptions,
      instructions: context
        ? `${improverInstructions(mode)}\n\n${context}`
        : improverInstructions(mode),
      prompt: text,
    })

    const improved = cleanImprovedText(reply)
    if (!improved) return { ok: false, error: "failed", allowance }

    const snapshot = capturePricingSnapshot(now)
    const credits = charged
      ? turnCreditCost({ modelId: primary.id, usage, snapshot })
      : 0

    const [row] = await db
      .insert(promptImprovements)
      .values({
        userId: user.id,
        templateId,
        modelId: primary.id,
        ...turnUsageTokens(usage),
        costMicroUsd: turnCostMicroUsd({ modelId: primary.id, usage, snapshot }),
        rateVersion: snapshot.rateVersion,
        credits,
      })
      .returning({ id: promptImprovements.id })

    if (row && credits > 0) {
      const ingested = await ingestImprovementCredits({
        userId: user.id,
        improvementId: row.id,
        credits,
        modelId: primary.id,
      })

      if (ingested) {
        await db
          .update(promptImprovements)
          .set({ creditsIngestedAt: new Date() })
          .where(eq(promptImprovements.id, row.id))
      }
    }

    return {
      ok: true,
      text: improved,
      credits,
      allowance: improverAllowance({
        ...quota,
        usedToday: quota.usedToday + 1,
        balance: quota.balance === null ? null : quota.balance - credits,
        now,
      }),
    }
  } catch (error) {
    console.error("Prompt improvement failed", error)

    return { ok: false, error: "failed", allowance }
  }
}
