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
  "rounded-md bg-primary/15 px-1 py-0.5 text-primary [box-decoration-break:clone] dark:bg-primary/25 dark:text-[color-mix(in_oklch,var(--primary),white_45%)]"

type ComposerEditor = {
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  disabled: boolean
  suggestion: Omit<SuggestionOptions, "editor">
  /** Paths `@path` may turn into chips when text is written in from outside. */
  knownPaths: readonly string[] | null
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
}: ComposerEditor) {
  const emitted = useRef(value)
  const latest = useRef({ onValueChange, onSubmit, knownPaths })
  useLayoutEffect(() => {
    latest.current = { onValueChange, onSubmit, knownPaths }
  })

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": placeholder,
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
