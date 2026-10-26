"use client"

import { useActionState, useEffect, useState, startTransition } from "react"
import { useTranslations } from "next-intl"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"

import { ChatComposer } from "@/components/chat-composer"
import type { TierId } from "@/lib/ai/model-catalog"
import { createGame } from "@/lib/games/actions"
import { newGameDraft } from "@/lib/games/new-game-draft"
import { initialTierId, newGameSearch } from "@/lib/games/new-game-query"
import {
  templateFromQuery,
  type TemplateId,
} from "@/lib/games/templates/catalog"
import { suggestions } from "@/lib/games/suggestions"

/**
 * Binds the composer to the `createGame` server action. The action is invoked
 * programmatically instead of through `<form action>` because the composer is
 * controlled and its submit handler already owns validation.
 *
 * The suggestion chips live here rather than on the page because clicking one
 * writes into this component's state. They were markup on the server page
 * before, which made them decoration: buttons with nothing bound to them.
 */
export function NewGameComposer({
  defaultTierId,
}: {
  /** The player's default tier from Settings › Game; `null` follows the app's. */
  defaultTierId: TierId | null
}) {
  const t = useTranslations("GameComposer")
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [value, setValue] = useState("")

  /**
   * The unsent text lives in the tab's draft (see `new-game-draft.ts`): read
   * after mount, because the server has no sessionStorage and reading it
   * during render would fail hydration, and replaced whenever the command
   * palette opens a prompt here while this page is already on screen.
   */
  useEffect(() => {
    const draft = newGameDraft.read()
    // sessionStorage only exists in the browser, so this cannot be the
    // initial state without the server and the client rendering different text.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setValue(draft)

    return newGameDraft.subscribe(setValue)
  }, [])

  function changeValue(next: string) {
    setValue(next)
    newGameDraft.write(next)
  }
  /**
   * Re-seeded whenever `?tier=` or the default changes underneath the mounted
   * composer — a settings change refreshes this page behind the dialog.
   */
  const queryTier = searchParams.get("tier")
  const [tierId, setTierId] = useState<TierId>(() =>
    initialTierId(queryTier, defaultTierId)
  )
  const tierSeed = `${queryTier}|${defaultTierId}`
  const [seededTier, setSeededTier] = useState(tierSeed)
  if (tierSeed !== seededTier) {
    setSeededTier(tierSeed)
    setTierId(initialTierId(queryTier, defaultTierId))
  }
  const queryTemplate = searchParams.get("template")
  const [templateId, setTemplateId] = useState<TemplateId>(() =>
    templateFromQuery(queryTemplate)
  )

  /**
   * The palette links here while this page may already be on screen, and a
   * push to the same route keeps the composer mounted — so a new `?template=`
   * has to replace the choice, not only seed it on mount.
   */
  const [seededTemplate, setSeededTemplate] = useState(queryTemplate)
  if (queryTemplate !== seededTemplate) {
    setSeededTemplate(queryTemplate)
    setTemplateId(templateFromQuery(queryTemplate))
  }
  const [state, formAction, pending] = useActionState(createGame, null)

  /** A game that could not be created keeps its text as the draft. */
  useEffect(() => {
    if (state?.error) newGameDraft.write(value)
    // Only a new result should write; typing already keeps the draft current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  /** A pick is kept in the URL, so a reload or a shared link keeps it. */
  function keepInUrl(change: { tier?: TierId; template?: TemplateId }) {
    router.replace(
      `${pathname}${newGameSearch(searchParams.toString(), change)}`,
      { scroll: false }
    )
  }

  function changeTier(next: TierId) {
    setTierId(next)
    keepInUrl({ tier: next })
  }

  function changeTemplate(next: TemplateId) {
    setTemplateId(next)
    keepInUrl({ template: next })
  }

  /**
   * The tier rides along with the prompt, and the action puts it back in the
   * query string of the page it redirects to — the same route the prompt takes.
   * Nothing is stored: a tier choice is what the next turn is sent with, not a
   * property of the game, so the games table has no business holding it.
   */
  function handleSubmit(prompt: string) {
    newGameDraft.clear()
    const formData = new FormData()
    formData.set("prompt", prompt)
    formData.set("tier", tierId)
    formData.set("template", templateId)

    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <ChatComposer
        value={value}
        onValueChange={changeValue}
        onSubmit={handleSubmit}
        tierId={tierId}
        onTierChange={changeTier}
        templateId={templateId}
        onTemplateChange={changeTemplate}
        autoFocus
        pending={pending}
        error={state?.error ?? null}
        improverMode="new"
      />
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.id}
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground"
            disabled={pending}
            /**
             * Fills the composer instead of creating the game outright. A
             * suggestion is a starting point, and the player is far more
             * likely to want a word changed in it than to want it sent
             * verbatim — and once it is sent, a game exists and a turn has
             * been paid for.
             */
            onClick={() => changeValue(t(`suggestions.${suggestion.id}.prompt`))}
          >
            <HugeiconsIcon icon={suggestion.icon} />
            {t(`suggestions.${suggestion.id}.label`)}
          </Button>
        ))}
      </div>
    </div>
  )
}
