"use client"

import { ArrowDown01Icon, GridIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { InputGroupButton } from "@workspace/ui/components/input-group"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"

import { TIERS, getTier, isTierId, type TierId } from "@/lib/ai/model-catalog"

type ModelPickerProps = {
  value: TierId
  onValueChange: (value: TierId) => void
  disabled?: boolean
}

/**
 * Chooses which tier builds the game. It owns nothing: the selection lives
 * with whoever owns the conversation, because that is the component that has
 * to hand the id to the transport as client data — a picker holding its own
 * state would show a choice the agent never hears about.
 *
 * A radio group rather than plain items, so the menu says which tier is
 * current instead of only offering the switch. `DropdownMenuRadioItem` draws
 * the check on the selected row for free.
 *
 * It lists tiers only — never a provider or a concrete model name. The
 * player picks a power/budget trade-off; the model registry decides what runs
 * behind it (`lib/ai/model-registry.ts`).
 */
export function ModelPicker({
  value,
  onValueChange,
  disabled = false,
}: ModelPickerProps) {
  const selected = getTier(value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <InputGroupButton type="button" disabled={disabled} size="sm">
            <HugeiconsIcon icon={GridIcon} />
            {selected.label}
            <HugeiconsIcon icon={ArrowDown01Icon} />
          </InputGroupButton>
        }
      />
      {/**
       * Wide enough for a tagline to breathe: the descriptions are the reason
       * the menu exists — the labels alone do not say which tier to pick.
       */}
      <DropdownMenuContent className="w-72" align="start">
        <DropdownMenuRadioGroup
          value={value}
          /**
           * Base UI types the radio value as `any`, so the id is narrowed back
           * here rather than asserted — a value that is not a tier is dropped
           * instead of travelling on to the agent.
           */
          onValueChange={(next) => {
            if (isTierId(next)) onValueChange(next)
          }}
        >
          {TIERS.map((tier) => (
            <DropdownMenuRadioItem
              key={tier.id}
              value={tier.id}
              /**
               * Base UI keeps a radio item's menu open on click, which suits a
               * list you tick several things in. This one is a single choice
               * that is done the moment it is made, so leaving the menu up
               * would only ask the player to dismiss it.
               */
              closeOnClick
            >
              {/**
               * `Item` at `xs` drops its own padding inside a menu (see the
               * `in-data-[slot=dropdown-menu-content]` variant), so the row
               * keeps the menu's spacing and the check its gutter.
               */}
              <Item size="xs">
                <ItemContent>
                  <ItemTitle>{tier.label}</ItemTitle>
                  <ItemDescription>{tier.tagline}</ItemDescription>
                </ItemContent>
              </Item>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
