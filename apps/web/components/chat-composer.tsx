"use client"

import { useActionState } from "react"
import {
  Airplane01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Car01Icon,
  CubeIcon,
  FlashIcon,
  GameController01Icon,
  GridIcon,
  Loading03Icon,
  SwordIcon,
  Target01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"

import { createGame } from "@/lib/games/actions"

const suggestions = [
  { icon: CubeIcon, label: "Voxel survival" },
  { icon: SwordIcon, label: "Ink samurai duel" },
  { icon: FlashIcon, label: "Comic-book firefight" },
  { icon: Airplane01Icon, label: "Realistic battlefield" },
  { icon: Target01Icon, label: "Fight-first shooter" },
  { icon: Car01Icon, label: "Jungle expedition drive" },
  { icon: GameController01Icon, label: "Sunny kingdom platformer" },
]

export function ChatComposer() {
  const [state, formAction, pending] = useActionState(createGame, null)

  return (
    <form
      action={formAction}
      className="flex w-full flex-col items-center gap-6"
    >
      <div className="flex w-full flex-col gap-2">
        <InputGroup>
          <InputGroupTextarea
            name="title"
            rows={3}
            disabled={pending}
            placeholder="Describe the game you want to build…"
          />
          <InputGroupAddon align="block-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton type="button">
                    <HugeiconsIcon icon={GridIcon} />
                    Kimi K3
                    <HugeiconsIcon icon={ArrowDown01Icon} />
                  </InputGroupButton>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuItem>Kimi K3</DropdownMenuItem>
                <DropdownMenuItem>Claude Opus 5</DropdownMenuItem>
                <DropdownMenuItem>GPT-5</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <InputGroupButton
              type="submit"
              disabled={pending}
              className="ml-auto rounded-full"
              variant="default"
              size="icon-sm"
            >
              <HugeiconsIcon
                icon={pending ? Loading03Icon : ArrowUp02Icon}
                className={pending ? "animate-spin" : undefined}
              />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {state?.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.label}
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground"
          >
            <HugeiconsIcon icon={suggestion.icon} />
            {suggestion.label}
          </Button>
        ))}
      </div>
    </form>
  )
}
