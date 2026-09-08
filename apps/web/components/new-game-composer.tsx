"use client"

import { useActionState, useState, startTransition } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { createGame } from "@/lib/games/actions"

/**
 * Binds the composer to the `createGame` server action. The action is invoked
 * programmatically instead of through `<form action>` because the composer is
 * controlled and its submit handler already owns validation.
 */
export function NewGameComposer() {
  const [value, setValue] = useState("")
  const [state, formAction, pending] = useActionState(createGame, null)

  function handleSubmit(prompt: string) {
    const formData = new FormData()
    formData.set("prompt", prompt)

    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <ChatComposer
      value={value}
      onValueChange={setValue}
      onSubmit={handleSubmit}
      pending={pending}
      error={state?.error ?? null}
    />
  )
}
