"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "@workspace/ui/components/toast"

import {
  canImprove,
  type ImproverAllowance,
} from "@/lib/games/improver/allowance"
import { onImproverAllowanceStale } from "@/lib/games/improver/allowance-channel"
import type { ImproverMode } from "@/lib/games/improver/instructions"
import type { TemplateId } from "@/lib/games/templates/catalog"
import { publishTurnCredits } from "@/lib/polar/credits-channel"

/**
 * The server actions, loaded on first use rather than imported. Next turns a
 * static import into an action reference anyway, but anything that renders
 * the composer outside Next — its tests — would otherwise load the database
 * client behind them just to render a button.
 */
const improverActions = () => import("@/lib/games/improver/actions")

/**
 * The improver's state for the composer: the allowance its tooltip reads,
 * the call in flight, and the one-step undo back to what the player wrote.
 * `mode` undefined turns it off entirely — no allowance is fetched.
 */
export function usePromptImprover({
  mode,
  value,
  setValue,
  templateId,
}: {
  mode?: ImproverMode
  value: string
  setValue: (value: string) => void
  templateId: TemplateId
}) {
  const t = useTranslations("GameComposer")
  const [allowance, setAllowance] = useState<ImproverAllowance | null>(null)
  const [improving, startImproving] = useTransition()
  const [undo, setUndo] = useState<{ original: string; improved: string } | null>(null)

  const refresh = useCallback(() => {
    improverActions()
      .then((actions) => actions.readImproverAllowance())
      .then(setAllowance)
      .catch(() => setAllowance({ kind: "unavailable" }))
  }, [])

  useEffect(() => {
    if (!mode) return
    refresh()
    return onImproverAllowanceStale(refresh)
  }, [mode, refresh])

  /** Undo is offered only while the composer still holds the improved text. */
  const canUndo = undo !== null && undo.improved === value

  function improve() {
    const text = value.trim()
    if (!mode || !text || !allowance || !canImprove(allowance) || improving) return

    startImproving(async () => {
      const { improvePrompt } = await improverActions()
      const result = await improvePrompt({ text, templateId, mode })
      setAllowance(result.allowance)

      if (!result.ok) {
        if (result.error !== "denied") {
          toast.add({ type: "error", title: t("improveFailed") })
        }
        return
      }

      setUndo({ original: value, improved: result.text })
      setValue(result.text)
      if (result.credits > 0) publishTurnCredits(result.credits)
    })
  }

  function restore() {
    if (!canUndo || !undo) return
    setValue(undo.original)
    setUndo(null)
  }

  return {
    enabled: Boolean(mode),
    allowance,
    improving,
    canUndo,
    improve,
    restore,
  }
}
