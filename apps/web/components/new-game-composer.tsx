"use client"

import { useActionState, useState, startTransition } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { DEFAULT_GAME_MODEL_ID, type GameModelId } from "@/lib/ai/model-catalog"
import { createGame } from "@/lib/games/actions"

/**
 * Binds the composer to the `createGame` server action. The action is invoked
 * programmatically instead of through `<form action>` because the composer is
 * controlled and its submit handler already owns validation.
 */
export function NewGameComposer() {
  const [value, setValue] = useState("")
  const [modelId, setModelId] = useState<GameModelId>(DEFAULT_GAME_MODEL_ID)
  const [state, formAction, pending] = useActionState(createGame, null)

  /**
   * The model rides along with the prompt, and the action puts it back in the
   * query string of the page it redirects to — the same route the prompt takes.
   * Nothing is stored: a model choice is what the next turn is sent with, not a
   * property of the game, so the games table has no business holding it.
   */
  function handleSubmit(prompt: string) {
    const formData = new FormData()
    formData.set("prompt", prompt)
    formData.set("model", modelId)

    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <ChatComposer
      value={value}
      onValueChange={setValue}
      onSubmit={handleSubmit}
      modelId={modelId}
      onModelChange={setModelId}
      pending={pending}
      error={state?.error ?? null}
    />
  )
}
