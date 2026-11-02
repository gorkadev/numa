"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { PluginKey } from "@tiptap/pm/state"
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion"

import { matchCommands, type SlashCommand } from "@/lib/games/slash-commands"

/** A `/` action the composer offers, with what choosing it does. */
export type ComposerCommand = SlashCommand & { run: () => void }

type OpenCommand = {
  /** Where the `/` sits in the document; an Escape is remembered against it. */
  from: number
  query: string
  /** The `/`'s top-left, relative to the editor's positioned ancestor. */
  anchor: { top: number; left: number }
  command: (command: ComposerCommand) => void
}

/** Its own key, so it runs beside the `@` mention suggestion instead of replacing it. */
const SLASH_COMMANDS_KEY = new PluginKey("slashCommands")

/**
 * The `/` actions menu, the counterpart to `useFileMentions` for `@`: the
 * editor's suggestion tracks what is typed after the slash, and the composer
 * renders the list. Choosing an action removes the `/query` it was picked
 * with and runs it; the rest of the draft stays. Without commands, `/` is text.
 */
export function useSlashCommands(commands: readonly ComposerCommand[] | undefined, listId: string) {
  const [open, setOpen] = useState<OpenCommand | null>(null)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [highlight, setHighlight] = useState({ key: "", index: 0 })

  const visible = Boolean(open && open.from !== dismissed)
  const matches = visible ? matchCommands(commands ?? [], open!.query) : []
  const key = open ? `${open.from}:${open.query}` : ""
  const index = highlight.key === key ? Math.min(highlight.index, Math.max(matches.length - 1, 0)) : 0

  function choose(command: ComposerCommand) {
    open?.command(command)
  }

  /** Takes the keys the open list needs; returns whether it took this one. */
  function handleKeyDown(event: KeyboardEvent) {
    if (!visible || event.isComposing) return false
    if (event.key === "Escape") {
      setDismissed(open!.from)
      return true
    }
    if (matches.length === 0) return false
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1
      const next = (index + step + matches.length) % matches.length
      setHighlight({ key, index: next })
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" })
      return true
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      choose(matches[index]!)
      return true
    }
    return false
  }

  /** The suggestion plugin outlives renders, so it reads the latest state through a ref. */
  const latest = useRef({ commands, handleKeyDown })
  useLayoutEffect(() => {
    latest.current = { commands, handleKeyDown }
  })

  const [suggestion] = useState<Omit<SuggestionOptions<ComposerCommand>, "editor">>(() => {
    function track(props: SuggestionProps<ComposerCommand>) {
      const rect = props.clientRect?.()
      const parent = props.editor.view.dom.offsetParent?.getBoundingClientRect()
      setOpen({
        from: props.range.from,
        query: props.query,
        anchor:
          rect && parent
            ? { top: rect.top - parent.top, left: rect.left - parent.left }
            : { top: 0, left: 0 },
        command: props.command,
      })
    }

    return {
      char: "/",
      pluginKey: SLASH_COMMANDS_KEY,
      allow: () => Boolean(latest.current.commands?.length),
      items: () => [],
      command: ({ editor, range, props }) => {
        editor.chain().focus().deleteRange(range).run()
        props.run()
      },
      render: () => ({
        onStart: track,
        onUpdate: track,
        onKeyDown: ({ event }) => latest.current.handleKeyDown(event),
        onExit() {
          setOpen(null)
          setDismissed(null)
        },
      }),
    }
  })

  return {
    suggestion,
    open: visible,
    anchor: open?.anchor ?? { top: 0, left: 0 },
    query: open?.query ?? "",
    matches,
    index,
    choose,
    /** Pointing at an action highlights it, so Enter and a click agree on which one. */
    highlightAt: (at: number) => setHighlight({ key, index: at }),
  }
}
