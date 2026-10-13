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

import {
  TEMPLATES,
  getTemplate,
  isTemplateId,
  type TemplateId,
} from "@/lib/games/templates/catalog"

type TemplatePickerProps = {
  value: TemplateId
  onValueChange: (value: TemplateId) => void
  disabled?: boolean
}

/**
 * Chooses the immutable starter kit for a new game. Its state belongs to the
 * caller because the picker only describes a choice; game creation owns the
 * form data and persists the selected catalog entry.
 */
export function TemplatePicker({
  value,
  onValueChange,
  disabled = false,
}: TemplatePickerProps) {
  const selected = getTemplate(value)

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
      <DropdownMenuContent className="w-72" align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (isTemplateId(next)) onValueChange(next)
          }}
        >
          {TEMPLATES.map((template) => (
            <DropdownMenuRadioItem
              key={template.id}
              value={template.id}
              closeOnClick
            >
              <Item size="xs">
                <ItemContent>
                  <ItemTitle>{template.label}</ItemTitle>
                  <ItemDescription>{template.tagline}</ItemDescription>
                </ItemContent>
              </Item>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
