"use client"

import { useLayoutEffect, useRef, useState } from "react"
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion"

import { mentionLabel } from "@/lib/games/mention-doc"
import { rankMentions } from "@/lib/games/mentions"

/** Fetches the game's file paths; called once each time a mention opens. */
export type MentionFilesLoader = (signal: AbortSignal) => Promise<string[]>

type MentionCommand = (attrs: { id: string; label: string }) => void

type OpenMention = {
  /** Where the `@` sits in the document; an Escape is remembered against it. */
  from: number
  query: string
  /** The `@`'s top-left, relative to the editor's positioned ancestor. */
  anchor: { top: number; left: number }
  command: MentionCommand
}

/**
 * The `@` file picker's state, fed by the editor's mention suggestion. The
 * list itself is rendered by the composer, in its own React tree, rather than
 * mounted by the suggestion plugin, so it keeps the composer's translations,
 * theme and tests.
 *
 * The listing is fetched as a mention opens, not on every keystroke — the
 * query only filters what is already here — and the previous listing stays on
 * screen while a fresh one arrives, since a turn changes a file or two at most.
 */
export function useFileMentions(load: MentionFilesLoader | undefined, listId: string) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [mention, setMention] = useState<OpenMention | null>(null)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [highlight, setHighlight] = useState({ key: "", index: 0 })

  const open = Boolean(mention && mention.from !== dismissed)
  const matches = open && files ? rankMentions(files, mention!.query) : []
  const key = mention ? `${mention.from}:${mention.query}` : ""
  const index = highlight.key === key ? Math.min(highlight.index, Math.max(matches.length - 1, 0)) : 0

  function choose(path: string) {
    mention?.command({ id: path, label: mentionLabel(path) })
  }

  /** Takes the keys the open list needs; returns whether it took this one. */
  function handleKeyDown(event: KeyboardEvent) {
    if (!open || event.isComposing) return false
    if (event.key === "Escape") {
      setDismissed(mention!.from)
      return true
    }
    if (matches.length === 0) return false
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1
      const next = (index + step + matches.length) % matches.length
      setHighlight({ key, index: next })
      // Only the arrow keys scroll: a pointer is already over what it highlights.
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" })
      return true
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      choose(matches[index]!)
      return true
    }
    return false
  }

  /**
   * The suggestion plugin outlives renders, so it reaches the latest loader
   * and key handler through a ref, synced after each render.
   */
  const latest = useRef({ load, handleKeyDown })
  useLayoutEffect(() => {
    latest.current = { load, handleKeyDown }
  })

  const [suggestion] = useState<Omit<SuggestionOptions, "editor">>(() => {
    let request: AbortController | null = null

    function refresh() {
      const loader = latest.current.load
      if (!loader) return
      request?.abort()
      const controller = new AbortController()
      request = controller
      loader(controller.signal)
        .then((paths) => {
          if (!controller.signal.aborted) setFiles(paths)
        })
        .catch(() => {
          if (!controller.signal.aborted) setFiles((current) => current ?? [])
        })
    }

    function track(props: SuggestionProps) {
      const rect = props.clientRect?.()
      const parent = props.editor.view.dom.offsetParent?.getBoundingClientRect()
      setMention({
        from: props.range.from,
        query: props.query,
        anchor:
          rect && parent
            ? { top: rect.top - parent.top, left: rect.left - parent.left }
            : { top: 0, left: 0 },
        command: props.command as MentionCommand,
      })
    }

    return {
      char: "@",
      allow: () => Boolean(latest.current.load),
      items: () => [],
      render: () => ({
        onStart(props) {
          refresh()
          track(props)
        },
        onUpdate: track,
        onKeyDown: ({ event }) => latest.current.handleKeyDown(event),
        onExit() {
          setMention(null)
          setDismissed(null)
        },
      }),
    }
  })

  return {
    suggestion,
    open,
    anchor: mention?.anchor ?? { top: 0, left: 0 },
    query: mention?.query ?? "",
    loading: open && files === null,
    files,
    matches,
    index,
    choose,
    /** Pointing at a file highlights it, so Enter and a click agree on which one. */
    highlightAt: (at: number) => setHighlight({ key, index: at }),
  }
}
