"use client"

import { useTranslations } from "next-intl"

import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@workspace/ui/components/marker"

import { Spinner } from "@/components/localized-spinner"
import type { ThinkingLabelKey } from "@/lib/games/build-progress"

/**
 * What the thread says while the agent has the turn and nothing to show yet.
 *
 * One line for the whole wait: it starts as plain "Thinking…" and takes the
 * build phase's own wording when the server reports one ("Planning build…"),
 * fading from one to the next so a change reads as progress rather than a
 * flicker. The caller decides the wording (`thinkingLabelKey`); this only
 * draws it.
 */
export function Thinking({ labelKey }: { labelKey: ThinkingLabelKey }) {
  const t = useTranslations("ChatActivity")

  return (
    /**
     * `ps-[13px]` lines this marker's content up with the bubble text beside
     * it — see the alignment note on `ToolGroup` in `./tool-group.tsx` for
     * where the 13px comes from.
     *
     * The marker is the only live region. The spinner is decorative so it does
     * not announce a second, context-free loading status beside this message.
     * Keyed on the label so each new wording fades in, and the fade is dropped
     * for readers who asked for less motion.
     */
    <Marker role="status" className="ps-[13px]">
      <MarkerIcon>
        <Spinner decorative />
      </MarkerIcon>
      <MarkerContent
        key={labelKey}
        className="shimmer animate-in fade-in duration-300 motion-reduce:animate-none"
      >
        {t(labelKey)}
      </MarkerContent>
    </Marker>
  )
}
