"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * Whether code blocks start with line wrapping on, from Settings › Game. Every
 * block — the agent's messages, sub-agent output and the Files viewer — reads
 * it as its initial state; the per-block toggle still overrides it locally.
 */
const CodeWrapContext = createContext(true)

export function CodeWrapProvider({
  wrap,
  children,
}: {
  wrap: boolean
  children: ReactNode
}) {
  return <CodeWrapContext value={wrap}>{children}</CodeWrapContext>
}

export function useDefaultCodeWrap(): boolean {
  return useContext(CodeWrapContext)
}
