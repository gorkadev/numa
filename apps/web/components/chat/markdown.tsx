"use client"

import { memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  MarkdownCode,
  MarkdownPre,
  rehypeInlineCodeProperty,
} from "@/components/chat/markdown-code"
import { safeHttpUrl } from "@/lib/url"

/**
 * `remark-gfm` is on for the same reason it always was: tables,
 * strikethrough and task lists are part of what the model reaches for, and
 * without the plugin they render as their own syntax.
 *
 * Module-level rather than built inline in the component: `react-markdown`
 * treats a new plugins array as a new configuration and reparses accordingly,
 * so an array literal in the render body would hand it a "new" array — and
 * therefore a reason to redo the parse — on every single re-render, streaming
 * or not.
 */
const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeInlineCodeProperty]

/**
 * The element overrides, hoisted out of the component for the same reason as
 * the plugin arrays above: an object literal passed as `components` is a new
 * object on every render, and `react-markdown` cannot tell a "new but
 * identical" map from one that actually changed.
 */
const COMPONENTS: Components = {
  code: MarkdownCode,
  pre: MarkdownPre,
  /**
   * Two things a link written by a model needs and a bare `<a>` does not give
   * it: a scheme check, because markdown will happily build an `href` out of
   * anything, and `target`/`rel`, because the thread is a live session and
   * following a link away from it would abandon a turn mid-stream.
   *
   * A rejected href renders as plain text rather than a dead link, so the
   * words the model wrote survive even when its URL does not.
   */
  a: ({ href, children, ...props }) => {
    const safe = safeHttpUrl(href)

    if (!safe) return <>{children}</>

    return (
      <a href={safe} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    )
  },
  /**
   * A table is the one block that will not fit a bubble. Wrapping it in
   * typeset's own scroll container lets it scroll inside the message instead
   * of stretching the thread — the class is what makes the table stop
   * shrinking to fit and take its natural width.
   */
  table: ({ children, ...props }) => (
    <div className="typeset-scroll">
      <table {...props}>{children}</table>
    </div>
  ),
}

/**
 * The agent's reply, rendered as the markdown it is written in.
 *
 * The agent has always written markdown — it is what a language model produces
 * unprompted — and the thread used to print it verbatim, so a player read
 * `**WASD**` instead of seeing the key emphasised. Nothing about the agent
 * changed here; this is the half of the contract the UI was not holding up.
 */
function MarkdownImpl({ children }: { children: string }) {
  return (
    /**
     * `typeset` supplies the rhythm — flow between blocks, list markers,
     * heading scale — and `typeset-chat` sizes it for a bubble rather than a
     * document page. See `packages/ui/src/styles/typeset.css`.
     */
    <div className="typeset typeset-chat">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Memoized on `children` alone. A message's earlier blocks stop changing the
 * moment a later one starts streaming, but the whole row still re-renders on
 * every chunk — without this, a finished block would re-run `react-markdown`
 * (and, inside it, react-shiki for every fenced block) on text that has not
 * moved, for as long as anything else in the same reply is still arriving.
 */
export const Markdown = memo(MarkdownImpl)
