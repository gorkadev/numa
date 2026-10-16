"use client"

import { useTranslations } from "next-intl"
import { Kbd } from "@workspace/ui/components/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { useIsMac } from "@/hooks/use-is-mac"
import { ArrowDown01Icon, LayoutTemplateIcon } from "@hugeicons/core-free-icons"
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
  isTemplateId,
  type TemplateId,
} from "@/lib/games/templates/catalog"

type TemplatePickerProps = {
  value: TemplateId
  onValueChange: (value: TemplateId) => void
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
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
  open,
  onOpenChange,
}: TemplatePickerProps) {
  const t = useTranslations("GameComposer")
  const isMac = useIsMac()
  const templateHint = isMac ? "⌃⇧V" : "Ctrl ⇧ V"

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <InputGroupButton
                  type="button"
                  disabled={disabled}
                  size="sm"
                  aria-keyshortcuts={!disabled ? "Control+Shift+V" : undefined}
                >
                  <HugeiconsIcon icon={LayoutTemplateIcon} />
                  {t(`templates.${value}.label`)}
                  <HugeiconsIcon icon={ArrowDown01Icon} />
                </InputGroupButton>
              }
            />
          }
        />
        <TooltipContent>
          {t("openTemplatePicker")} <Kbd>{templateHint}</Kbd>
        </TooltipContent>
      </Tooltip>
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
                  <ItemTitle>{t(`templates.${template.id}.label`)}</ItemTitle>
                  <ItemDescription>{t(`templates.${template.id}.tagline`)}</ItemDescription>
                </ItemContent>
              </Item>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
