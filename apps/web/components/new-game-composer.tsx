"use client"

import { useActionState, useState, startTransition } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"

import { ChatComposer } from "@/components/chat-composer"
import { DEFAULT_TIER_ID, type TierId } from "@/lib/ai/model-catalog"
import { createGame } from "@/lib/games/actions"
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
export function NewGameComposer() {
  const [value, setValue] = useState("")
  const [tierId, setTierId] = useState<TierId>(DEFAULT_TIER_ID)
  const [state, formAction, pending] = useActionState(createGame, null)

  /**
   * The tier rides along with the prompt, and the action puts it back in the
   * query string of the page it redirects to — the same route the prompt takes.
   * Nothing is stored: a tier choice is what the next turn is sent with, not a
   * property of the game, so the games table has no business holding it.
   */
  function handleSubmit(prompt: string) {
    const formData = new FormData()
    formData.set("prompt", prompt)
    formData.set("tier", tierId)

    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <ChatComposer
        value={value}
        onValueChange={setValue}
        onSubmit={handleSubmit}
        tierId={tierId}
        onTierChange={setTierId}
        pending={pending}
        error={state?.error ?? null}
      />
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.label}
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
            onClick={() => setValue(suggestion.prompt)}
          >
            <HugeiconsIcon icon={suggestion.icon} />
            {suggestion.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
