"use client"

import { useRef, useState, type KeyboardEvent, type RefObject } from "react"

import { caretPosition } from "@/components/chat/caret-position"
import { activeMention, insertMention, rankMentions, type ActiveMention } from "@/lib/games/mentions"

/** Fetches the game's file paths; called once each time a mention opens. */
export type MentionFilesLoader = (signal: AbortSignal) => Promise<string[]>

type FileMentions = {
  load?: MentionFilesLoader
  value: string
  setValue: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** The list's id; each option's id is it plus the option's index. */
  listId: string
}

/**
 * The `@` file picker's state, kept beside the text area rather than in it:
 * the text stays plain, and a chosen file lands in it as its full path, which
 * is all the agent needs to open it with its own tools.
 *
 * The listing is fetched as a mention opens, not on every keystroke — the
 * query only filters what is already here — and the previous listing stays on
 * screen while a fresh one arrives, since a turn changes a file or two at most.
 */
export function useFileMentions({ load, value, setValue, textareaRef, listId }: FileMentions) {
  const [caret, setCaret] = useState<number | null>(null)
  const [files, setFiles] = useState<string[] | null>(null)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [highlight, setHighlight] = useState({ key: "", index: 0 })
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const request = useRef<AbortController | null>(null)

  const mention = load && caret !== null ? activeMention(value, caret) : null
  const open = Boolean(mention && mention.start !== dismissed)
  const matches = open && files ? rankMentions(files, mention!.query) : []
  const key = mention ? `${mention.start}:${mention.query}` : ""
  const index = highlight.key === key ? Math.min(highlight.index, Math.max(matches.length - 1, 0)) : 0

  function refresh() {
    if (!load) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    load(controller.signal)
      .then((paths) => {
        if (!controller.signal.aborted) setFiles(paths)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFiles((current) => current ?? [])
      })
  }

  /**
   * Called with the text area's text and caret after every change, click or
   * arrow key. A mention that just opened fetches the listing; one that
   * closed forgets an Escape, so the next `@` opens again.
   */
  function track(nextValue: string, element: HTMLTextAreaElement) {
    const nextCaret =
      element.selectionStart === element.selectionEnd ? element.selectionStart : null
    const next = load && nextCaret !== null ? activeMention(nextValue, nextCaret) : null
    if (next && (!mention || next.start !== mention.start)) refresh()
    if (!next) setDismissed(null)
    else setAnchor(anchorOf(element, next.start))
    setCaret(nextCaret)
  }

  function choose(path: string) {
    if (!mention) return
    const next = insertMention(value, mention, path)
    setValue(next.value)
    setCaret(next.caret)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  /** Takes the keys the open list needs; returns whether it took this one. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || event.nativeEvent.isComposing) return false
    if (event.key === "Escape") {
      setDismissed((mention as ActiveMention).start)
    } else if (matches.length === 0) {
      return false
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1
      const next = (index + step + matches.length) % matches.length
      setHighlight({ key, index: next })
      // Only the arrow keys scroll: a pointer is already over what it highlights.
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" })
    } else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      choose(matches[index]!)
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  return {
    open,
    anchor,
    query: mention?.query ?? "",
    loading: open && files === null,
    matches,
    index,
    track,
    choose,
    /** Pointing at a file highlights it, so Enter and a click agree on which one. */
    highlightAt: (at: number) => setHighlight({ key, index: at }),
    close: () => setCaret(null),
    handleKeyDown,
  }
}

/**
 * The top-left of a mention's `@`, in the coordinates of the text area's
 * offset parent — the input group the list is positioned in — so the list
 * opens over the mention, on whatever line it was typed.
 */
function anchorOf(textarea: HTMLTextAreaElement, start: number) {
  const { top, left } = caretPosition(textarea, start)
  return { top: textarea.offsetTop + top, left: textarea.offsetLeft + left }
}
