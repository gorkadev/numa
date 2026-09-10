"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  MarkdownCode,
  MarkdownPre,
  rehypeInlineCodeProperty,
} from "@/components/markdown-code"
import { safeHttpUrl } from "@/lib/url"

/**
 * The agent's reply, rendered as the markdown it is written in.
 *
 * The agent has always written markdown — it is what a language model produces
 * unprompted — and the thread used to print it verbatim, so a player read
 * `**WASD**` instead of seeing the key emphasised. Nothing about the agent
 * changed here; this is the half of the contract the UI was not holding up.
 *
 * `remark-gfm` is on for the same reason: tables, strikethrough and task lists
 * are part of what the model reaches for, and without the plugin they render
 * as their own syntax.
 */
export function Markdown({ children }: { children: string }) {
  return (
    /**
     * `typeset` supplies the rhythm — flow between blocks, list markers,
     * heading scale — and `typeset-chat` sizes it for a bubble rather than a
     * document page. See `packages/ui/src/styles/typeset.css`.
     */
    <div className="typeset typeset-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeInlineCodeProperty]}
        components={{
          code: MarkdownCode,
          pre: MarkdownPre,
          /**
           * Two things a link written by a model needs and a bare `<a>` does
           * not give it: a scheme check, because markdown will happily build
           * an `href` out of anything, and `target`/`rel`, because the thread
           * is a live session and following a link away from it would abandon
           * a turn mid-stream.
           *
           * A rejected href renders as plain text rather than a dead link, so
           * the words the model wrote survive even when its URL does not.
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
           * A table is the one block that will not fit a bubble. Wrapping it
           * in typeset's own scroll container lets it scroll inside the
           * message instead of stretching the thread — the class is what makes
           * the table stop shrinking to fit and take its natural width.
           */
          table: ({ children, ...props }) => (
            <div className="typeset-scroll">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
