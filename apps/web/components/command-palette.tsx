"use client"

import { useRouter } from "next/navigation"
import { MessageCircleIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Game } from "@workspace/db/schema"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

/**
 * The palette is a controlled dialog rather than one owning its own state,
 * because two different buttons open it — the header one while the sidebar is
 * expanded, the rail one while it is collapsed — and the ⌘K chord is a third
 * caller that belongs to neither. The one place all three already meet is
 * `AppSidebar`, so that is where `open` lives.
 */
export function CommandPalette({
  games,
  open,
  onOpenChange,
}: {
  games: Game[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  /**
   * Close first, then navigate. The other order leaves the dialog mounted
   * across the route change, so its exit animation competes with the incoming
   * page for the same frame.
   */
  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search games and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="new game" onSelect={() => go("/")}>
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
            New game
          </CommandItem>
        </CommandGroup>
        {games.length > 0 && (
          <CommandGroup heading="Recents">
            {games.map((game) => (
              <CommandItem
                key={game.id}
                /**
                 * cmdk filters on `value`, and the default value is the item's
                 * text content — which here is the title plus whatever the icon
                 * contributes. Spelling it out keeps the match on the title
                 * alone, and the id keeps two games of the same name distinct.
                 */
                value={`${game.title} ${game.id}`}
                onSelect={() => go(`/games/${game.id}`)}
              >
                <HugeiconsIcon icon={MessageCircleIcon} strokeWidth={2} />
                <span className="truncate">{game.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
