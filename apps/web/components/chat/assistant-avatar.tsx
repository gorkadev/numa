import Image from "next/image"

import { MessageAvatar } from "@workspace/ui/components/message"

/**
 * The agent's avatar, pinned to the top of its row.
 *
 * `MessageAvatar` is `self-end` with a `-translate-y-8` that switches on
 * whenever the row contains a `MessageFooter` (which `MessageActions`
 * renders) — a layout built for a row whose footer sits directly under a
 * short avatar-height bubble. Actions are withheld while a message is still
 * streaming, so that translate flips on the instant a turn finishes: the
 * avatar jumps 32px at the exact moment the reader's eye is on the reply. On
 * a long reply it is worse than a jump — the avatar sits at the bottom next
 * to the action row for the whole time the turn streams, nowhere near the
 * text it belongs to.
 *
 * Overridden here rather than in the primitive: every other use of
 * `MessageAvatar` (there is currently one, this one) keeps the primitive's
 * own default, and `cn`'s tailwind-merge pass resolves both the `self-*` and
 * the `translate-y-*` conflicts in this className's favour because it is the
 * one applied last.
 */
export function AssistantAvatar() {
  return (
    <MessageAvatar className="self-start bg-transparent p-1 group-has-data-[slot=message-footer]/message:translate-y-0">
      <Image src="/logo.svg" alt="Numa" width={20} height={24} />
    </MessageAvatar>
  )
}
