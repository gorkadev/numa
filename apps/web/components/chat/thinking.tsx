"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@workspace/ui/components/marker"
import { Spinner } from "@workspace/ui/components/spinner"

/**
 * What the thread says while the agent has the turn and nothing to show yet.
 *
 * The phrases rotate because a line that never changes stops reading as
 * activity after the first few seconds — it reads as a stuck screen. They are
 * deliberately vague: this is the stretch before the first token, so the only
 * honest thing to say is that the agent is working, and a specific claim here
 * would be one nothing has happened to justify.
 */
const THINKING_PHRASE_KEYS = [
  "thinking",
  "workingOutWhatToChange",
  "planningTheEdit",
  "gettingToIt",
] as const

const THINKING_INTERVAL = 2600

export function Thinking({ reconnecting = false }: { reconnecting?: boolean }) {
  const t = useTranslations("ChatActivity")
  const [phrase, setPhrase] = useState(0)

  useEffect(() => {
    if (reconnecting) return

    const timer = setInterval(
      () => setPhrase((it) => (it + 1) % THINKING_PHRASE_KEYS.length),
      THINKING_INTERVAL
    )

    return () => clearInterval(timer)
  }, [reconnecting])

  return (
    /**
     * `ps-[13px]` lines this marker's content up with the bubble text beside
     * it — see the alignment note on `ToolGroup` in `./tool-group.tsx` for
     * where the 13px comes from.
     *
     * The marker is the only live region. The spinner is decorative so it does
     * not announce a second, context-free loading status beside this message.
     */
    <Marker role="status" className="ps-[13px]">
      <MarkerIcon>
        <Spinner decorative />
      </MarkerIcon>
      <MarkerContent className="shimmer">
        {reconnecting
          ? t("reconnecting")
          : `${t(THINKING_PHRASE_KEYS[phrase]!)}…`}
      </MarkerContent>
    </Marker>
  )
}
