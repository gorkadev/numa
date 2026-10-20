"use client"

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react"
import type { ExtraProps } from "react-markdown"
import { TextWrapIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@workspace/ui/components/code-block"
import { useTranslations } from "next-intl"

import { useHighlightedCode } from "@/hooks/use-highlighted-code"

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> &
  ExtraProps & {
    inline?: boolean
  }

function FencedCode({ code, language }: { code: string; language: string }) {
  const t = useTranslations("ChatMessages")
  const [wrap, setWrap] = useState(true)
  // The generated hook removes the Markdown parser's final newline once.
  const lines = useHighlightedCode(code, language)

  return (
    <CodeBlock className="not-typeset mt-[0.75em] bg-card dark:ring-0">
      <CodeBlockHeader>
        <CodeBlockTitle className="font-mono text-xs text-muted-foreground">
          {language || "text"}
        </CodeBlockTitle>
        <CodeBlockActions>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("wrapLines")}
            aria-pressed={wrap}
            className="aria-pressed:text-foreground"
            onClick={() => setWrap((value) => !value)}
          >
            <HugeiconsIcon icon={TextWrapIcon} strokeWidth={2} />
          </Button>
          <CodeBlockCopyButton
            value={code.replace(/\n$/, "")}
            copyLabel={t("copyCode")}
            copiedLabel={t("copied")}
          />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent wrap={wrap} lineNumbers>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}

export function MarkdownCode({
  className,
  children,
  inline,
  node: _node,
  ...props
}: MarkdownCodeProps) {
  // ReactMarkdown's AST node is metadata, not a DOM attribute.
  void _node
  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  return (
    <FencedCode
      code={String(children ?? "")}
      language={/language-(\S+)/.exec(className ?? "")?.[1] ?? ""}
    />
  )
}

// Markdown supplies a pre wrapper; CodeBlockContent owns the only pre/code pair.
export function MarkdownPre({ children }: { children?: ReactNode }) {
  return <>{children}</>
}
