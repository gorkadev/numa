"use client"

import { createContext, useContext, type ReactNode } from "react"

import {
  DEFAULT_MESSAGE_ANIMATION,
  type MessageAnimationId,
} from "@/lib/chat/message-animations"

/**
 * How a sent message enters the thread, from Settings › Game. Read by the
 * thread's user rows only; the agent's replies stream in without an entrance.
 */
const MessageAnimationContext = createContext<MessageAnimationId>(
  DEFAULT_MESSAGE_ANIMATION
)

export function MessageAnimationProvider({
  animation,
  children,
}: {
  animation: MessageAnimationId
  children: ReactNode
}) {
  return (
    <MessageAnimationContext value={animation}>{children}</MessageAnimationContext>
  )
}

export function useMessageAnimation(): MessageAnimationId {
  return useContext(MessageAnimationContext)
}
