"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { Extension, mergeAttributes } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Mention from "@tiptap/extension-mention"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import { Placeholder, UndoRedo } from "@tiptap/extensions"
import { useEditor } from "@tiptap/react"
import type { SuggestionOptions } from "@tiptap/suggestion"

import { docToText, mentionedPaths, textToDoc } from "@/lib/games/mention-doc"

/**
 * A file mention chip, in the composer and in sent messages alike. The text is
 * the primary hue lifted towards white in dark mode, where the primary itself
 * is too dark to read on the composer.
 */
export const MENTION_CHIP_CLASS =
  "cursor-pointer rounded-md bg-primary/15 px-1 py-0.5 text-primary [box-decoration-break:clone] hover:bg-primary/25 dark:bg-primary/25 dark:text-[color-mix(in_oklch,var(--primary),white_45%)] dark:hover:bg-primary/35"

/**
 * The editable element itself, styled as the text area it replaced — the same
 * classes `Textarea` and `InputGroupTextarea` gave it, so the composer looks
 * exactly as before. It carries the input group's control slot because it is
 * what takes focus, and the group draws its focus ring from that slot's
 * `:focus-visible`. The placeholder is drawn from the empty first paragraph,
 * which is where Tiptap marks it. Unlike a text area, a div inherits its
 * page's text alignment and wrapping — the new-game screen centres and
 * balances its text — so both are set back to a text area's own.
 */
const EDITOR_CLASS =
  "min-h-16 max-h-48 w-full overflow-y-auto px-2.5 py-3 text-start text-wrap text-base break-words whitespace-pre-wrap outline-none md:text-sm [&[contenteditable=false]]:cursor-not-allowed [&[contenteditable=false]]:opacity-50 [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"

type ComposerEditor = {
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  disabled: boolean
  suggestion: Omit<SuggestionOptions, "editor">
  /** Paths `@path` may turn into chips when text is written in from outside. */
  knownPaths: readonly string[] | null
  /** Opens a chip's file in the side panel; without it a chip is not clickable. */
  onOpenFile?: (path: string) => void
}

/**
 * The composer's editor. It still speaks plain text to the outside: `value`
 * goes in and comes out as a string with each chip written as `@path`, so the
 * draft, dictation, the prompt improver and sending never see the document.
 *
 * Text written from outside — dictation, the improver, clearing after a send —
 * replaces the document, turning back into chips the `@path`s the document
 * already held or the game has.
 */
export function useComposerEditor({
  value,
  onValueChange,
  onSubmit,
  placeholder,
  disabled,
  suggestion,
  knownPaths,
  onOpenFile,
}: ComposerEditor) {
  const emitted = useRef(value)
  const latest = useRef({ onValueChange, onSubmit, knownPaths, onOpenFile })
  useLayoutEffect(() => {
    latest.current = { onValueChange, onSubmit, knownPaths, onOpenFile }
  })

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": placeholder,
        "data-slot": "input-group-control",
        class: EDITOR_CLASS,
      },
      /** A chip in the message being written opens its file, as a sent one does. */
      handleClickOn(_view, _pos, node) {
        if (node.type.name !== "mention" || !latest.current.onOpenFile) return false
        latest.current.onOpenFile(node.attrs.id as string)
        return true
      },
    },
    content: textToDoc(value, new Set()),
    extensions: [
      Document,
      Paragraph,
      Text,
      UndoRedo,
      Placeholder.configure({ placeholder }),
      Mention.configure({
        deleteTriggerWithBackspace: true,
        renderText: ({ node }) => `@${node.attrs.id}`,
        renderHTML: ({ node }) => [
          "span",
          mergeAttributes({
            "data-type": "mention",
            "data-id": node.attrs.id,
            "data-label": node.attrs.label,
            title: node.attrs.id,
            class: MENTION_CHIP_CLASS,
          }),
          node.attrs.label ?? node.attrs.id,
        ],
        suggestion,
      }),
      /**
       * Enter sends and Shift+Enter starts a new line, as in the text area it
       * replaces. The priority sits between the mention suggestion (101), which
       * takes Enter first while its list is open, and Tiptap's own keymap (100),
       * which would otherwise split the paragraph.
       */
      Extension.create({
        name: "composerKeys",
        priority: 100.5,
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              latest.current.onSubmit()
              return true
            },
            "Shift-Enter": () => this.editor.commands.splitBlock(),
          }
        },
      }),
    ],
    onUpdate({ editor }) {
      const text = docToText(editor.getJSON() as Parameters<typeof docToText>[0])
      emitted.current = text
      latest.current.onValueChange(text)
    },
  })

  useEffect(() => {
    if (!editor || value === emitted.current) return
    const known = new Set([
      ...mentionedPaths(editor.getJSON() as Parameters<typeof mentionedPaths>[0]),
      ...(latest.current.knownPaths ?? []),
    ])
    emitted.current = value
    editor.commands.setContent(textToDoc(value, known), { emitUpdate: false })
    editor.commands.setTextSelection(editor.state.doc.content.size)
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])

  return editor
}
