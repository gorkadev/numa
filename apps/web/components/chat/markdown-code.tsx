"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react"

import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
/**
 * The web bundle rather than the full one: it ships the browser languages —
 * JS, TS, HTML, CSS, JSON — and drops the several hundred others. This agent
 * builds browser games, so a snippet it puts in the chat is one of those, and
 * the default entry point would pull in megabytes of grammars for languages
 * that can never appear here.
 */
import ShikiHighlighter, { rehypeInlineCodeProperty } from "react-shiki/web"
import { useTheme } from "next-themes"

/**
 * Re-exported so the renderer imports its plugin from the same module as the
 * component that plugin exists to serve.
 *
 * `react-markdown` gives `code` no way to tell an inline span from a fenced
 * block — both arrive as `<code>`. This rehype pass sets the `inline` prop
 * before render, which is what lets one component answer for both.
 */
export { rehypeInlineCodeProperty }

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  /**
   * Cleared on unmount, because a block copied and then scrolled out of the
   * virtualised viewport would otherwise leave a timer holding a setter for a
   * component that is gone.
   */
  const timeout = useRef<number>(0)

  useEffect(() => () => window.clearTimeout(timeout.current), [])

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)

      setCopied(true)
      window.clearTimeout(timeout.current)
      timeout.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /**
       * The clipboard is gated on a secure context and on permission, so this
       * can genuinely fail. Swallowed: the button simply does not flip, which
       * is a better answer than an error the player cannot act on.
       */
    }
  }, [code])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? "Copied" : "Copy code"}
      className="absolute top-2 right-2 z-10 bg-transparent text-muted-foreground hover:text-foreground"
      onClick={onCopy}
    >
      <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={2} />
    </Button>
  )
}

/**
 * A fenced code block, highlighted — or an inline `code` span, left alone.
 *
 * Inline spans return untouched on purpose: typeset already gives them their
 * background, radius and monospace face, and running a syntax highlighter over
 * a two-word fragment produces colour that means nothing.
 */
export function MarkdownCode({
  className,
  children,
  inline,
  ...props
}: MarkdownCodeProps) {
  const { resolvedTheme } = useTheme()

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  const code = String(children).replace(/\n$/, "")
  const language = /language-([\w-]+)/.exec(className || "")?.[1]

  return (
    /**
     * `not-typeset` hands the block to Shiki: typeset styles `pre` and `code`
     * for a document, and those rules would fight the highlighter's own
     * background and spacing. The flow margin stays here, because the block is
     * still a paragraph-level thing in the reply's rhythm.
     */
    <div className="not-typeset relative mt-[0.75em]">
      {language ? (
        <span className="absolute top-2 right-10 z-10 flex h-6 items-center font-mono text-xs text-muted-foreground">
          {language}
        </span>
      ) : null}
      <CopyButton code={code} />
      <ShikiHighlighter
        language={language || "text"}
        theme={resolvedTheme === "dark" ? "github-dark" : "github-light"}
        /**
         * Highlighting is debounced while the block is still arriving. Without
         * it every token of a streamed snippet re-runs the highlighter over
         * the whole block, which is what turns a long fence into a stutter.
         */
        delay={100}
        showLanguage={false}
        /**
         * `background`, not `muted`: the bubble this sits in is already
         * `secondary`, and in the dark theme `--secondary` and `--muted` are
         * the same colour — a muted block would be an invisible rectangle on
         * an identical background. Going darker than the bubble is what makes
         * the code read as inset into the reply.
         */
        className="overflow-hidden rounded-lg border border-border/60 bg-background text-[0.875em] leading-normal [&_pre]:bg-background!"
      >
        {code}
      </ShikiHighlighter>
    </div>
  )
}

/**
 * `react-markdown` wraps a fenced block in `<pre><code>`, and Shiki renders a
 * `<pre>` of its own. Unwrapping the outer one is what keeps the two from
 * nesting — a `pre` inside a `pre`, with typeset's padding applied twice.
 */
export function MarkdownPre({ children }: { children?: ReactNode }) {
  return <>{children}</>
}
