import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { Message, MessageContent } from "@workspace/ui/components/message"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

/**
 * The chat shell, measured from `GameChat` at 375/768/1280: a 56px header with
 * `px-4`, `gap-1` and 28px icon controls; a 736px message column (`max-w-3xl`
 * inside `px-4`) whose bubbles cap at 80% of the row; and the 112px composer
 * surface.
 *
 * The header, the column and the composer's outer padding are the same
 * classes `game-chat.tsx` and `chat-thread.tsx` use. The bubbles are the
 * `Bubble`/`BubbleContent` pair `ChatMessage` renders, so the 22px radius,
 * the 10/12 padding and the 80% cap come from the primitive rather than from
 * copied pixel values.
 *
 * Every placeholder bubble uses the `muted` variant even though production
 * paints the player's turn `default` and the agent's `secondary`. A `Skeleton`
 * is `bg-muted`, so nesting one inside a primary or secondary surface leaves a
 * coloured ring around the block; `muted` is the one variant where the pulse
 * and the bubble share a colour and read as a single shape.
 *
 * The assistant avatar is the same 32px `MessageAvatar` `ChatMessage` puts beside every assistant turn: it is what leaves the
 * measured 696px content column inside the 736px row, and therefore what puts
 * the 80% bubble cap at 556.8 instead of 588.8.
 *
 * The preview pane is deliberately absent: whether a game has a sandbox — and
 * therefore a preview at all — is not knowable while loading (task decision 5).
 */
export default function Loading() {
  return (
    <div className="flex h-svh overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 px-4">
          <MobileSidebarTrigger className="-ms-1.5" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-40 max-w-full" />
          </div>
          <Skeleton className="size-7" />
          <Skeleton className="size-7" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
              <Message align="start">
                <Skeleton className="size-8 shrink-0 self-end rounded-full" />
                <MessageContent>
                  <Bubble variant="muted">
                    <BubbleContent>
                      <Skeleton className="h-5 w-[35rem] max-w-full" />
                    </BubbleContent>
                  </Bubble>
                  <Bubble variant="muted">
                    <BubbleContent>
                      <Skeleton className="h-5 w-64 max-w-full" />
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
              <Message align="end">
                <MessageContent>
                  <Bubble align="end" variant="muted">
                    <BubbleContent>
                      <Skeleton className="h-5 w-64 max-w-full" />
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            </div>
          </div>
          {/**
           * `InputGroup` is a client component, so its surface is mirrored here
           * instead: `rounded-2xl` (18px) over `bg-input/50`, a 64px control
           * area and a 46px addon row (6 top + 8 bottom + a 32px send control),
           * 112 in total once the transparent border is counted.
           */}
          <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-4 pb-4">
            <div className="flex w-full flex-col rounded-2xl border border-transparent bg-input/50">
              <div className="flex h-16 items-start px-3 py-3">
                <Skeleton className="h-5 w-2/5" />
              </div>
              <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-2">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="ml-auto size-8 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
