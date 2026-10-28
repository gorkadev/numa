"use client"

import * as React from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIsMac } from "@/hooks/use-is-mac"
import {
  ArrowDown01Icon,
  GridViewIcon,
  LayoutTemplateIcon,
  ListViewIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { isTemplateId, type TemplateId } from "@/lib/games/templates/catalog"
import {
  dialogTemplates,
  menuTemplates,
  searchTemplates,
  templatePreviewSrc,
} from "@/lib/games/templates/picker"

/** How the dialog lays templates out: one wide row each, or three per row. */
type TemplateView = "list" | "grid"

type TemplatePickerProps = {
  value: TemplateId
  onValueChange: (value: TemplateId) => void
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * The template an existing game was created from. It reads like the picker's
 * trigger so the composer looks the same before and after creation, but it is
 * plain text: the template is fixed once the game exists.
 */
export function LockedTemplate({ value }: { value: TemplateId }) {
  const t = useTranslations("GameComposer")

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <InputGroupText
            data-slot="locked-template"
            tabIndex={0}
            className="h-8 px-2.5"
          >
            <HugeiconsIcon icon={LayoutTemplateIcon} />
            {t(`templates.${value}.label`)}
          </InputGroupText>
        }
      />
      <TooltipContent>{t("templateLocked")}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Chooses the immutable starter kit for a new game. Its state belongs to the
 * caller because the picker only describes a choice; game creation owns the
 * form data and persists the selected catalog entry.
 *
 * The menu stays short: three templates and a "View more" entry that opens
 * every template, with its preview, in a dialog.
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
  const [dialogOpen, setDialogOpen] = React.useState(false)
  /** Kept here so the chosen layout survives closing and reopening the dialog. */
  const [view, setView] = React.useState<TemplateView>("list")

  return (
    <>
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
                    aria-keyshortcuts={
                      !disabled ? "Control+Shift+V" : undefined
                    }
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
            {menuTemplates(value).map((template) => (
              <DropdownMenuRadioItem
                key={template.id}
                value={template.id}
                closeOnClick
              >
                <Item size="xs">
                  <ItemContent>
                    <ItemTitle>{t(`templates.${template.id}.label`)}</ItemTitle>
                    <ItemDescription>
                      {t(`templates.${template.id}.tagline`)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={GridViewIcon} />
            {t("viewMoreTemplates")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TemplateDialog
        value={value}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        view={view}
        onViewChange={setView}
        onValueChange={(next) => {
          onValueChange(next)
          setDialogOpen(false)
        }}
      />
    </>
  )
}

/**
 * Every template with its preview, searchable, as wide rows or a grid.
 * Clicking a template only marks it; "Select" commits it and closes, so a
 * reader can compare before choosing.
 */
function TemplateDialog({
  value,
  open,
  onOpenChange,
  onValueChange,
  view,
  onViewChange,
}: {
  value: TemplateId
  open: boolean
  onOpenChange: (open: boolean) => void
  onValueChange: (value: TemplateId) => void
  view: TemplateView
  onViewChange: (view: TemplateView) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-3xl">
        {/* Mounted per opening, so the search and the marked template start fresh each time. */}
        <TemplateDialogBody
          value={value}
          onValueChange={onValueChange}
          view={view}
          onViewChange={onViewChange}
        />
      </DialogContent>
    </Dialog>
  )
}

function TemplateDialogBody({
  value,
  onValueChange,
  view,
  onViewChange,
}: {
  value: TemplateId
  onValueChange: (value: TemplateId) => void
  view: TemplateView
  onViewChange: (view: TemplateView) => void
}) {
  const t = useTranslations("GameComposer")
  const [query, setQuery] = React.useState("")
  const [marked, setMarked] = React.useState<TemplateId>(value)
  const templates = searchTemplates(
    dialogTemplates(),
    query,
    (template) =>
      `${t(`templates.${template.id}.label`)} ${t(`templates.${template.id}.tagline`)}`
  )
  const grid = view === "grid"

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("openTemplatePicker")}</DialogTitle>
        <DialogDescription>{t("templateDialogDescription")}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between gap-3">
        <InputGroup className="max-w-xs">
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("templateSearchPlaceholder")}
            aria-label={t("templateSearchPlaceholder")}
          />
          <InputGroupAddon>
            <HugeiconsIcon
              icon={Search01Icon}
              className="size-4"
              strokeWidth={2}
            />
          </InputGroupAddon>
        </InputGroup>
        <ToggleGroup
          value={[view]}
          onValueChange={(values) => {
            const next = values[0]
            if (next === "list" || next === "grid") onViewChange(next)
          }}
          variant="outline"
          size="sm"
          aria-label={t("templateViewLabel")}
        >
          <ToggleGroupItem value="list" aria-label={t("templateViewList")}>
            <HugeiconsIcon icon={ListViewIcon} />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label={t("templateViewGrid")}>
            <HugeiconsIcon icon={GridViewIcon} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="-mx-6 no-scrollbar min-h-0 overflow-y-auto overscroll-contain px-6 py-1">
        {templates.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {t("templateSearchEmpty")}
          </p>
        ) : null}
        <RadioGroup
          value={marked}
          onValueChange={(next) => {
            if (isTemplateId(next)) setMarked(next)
          }}
          aria-label={t("openTemplatePicker")}
          className={cn(grid && "grid-cols-1 sm:grid-cols-2 md:grid-cols-3")}
        >
          {templates.map((template) => {
            const src = templatePreviewSrc(template.id)
            const id = `template-choice-${template.id}`
            return (
              <FieldLabel key={template.id} htmlFor={id}>
                <Field
                  orientation="horizontal"
                  className={cn("cursor-pointer", grid && "flex-wrap")}
                >
                  {src ? (
                    <Image
                      src={src}
                      alt=""
                      width={640}
                      height={360}
                      sizes={
                        grid
                          ? "(min-width: 768px) 240px, (min-width: 640px) 50vw, 100vw"
                          : "(min-width: 640px) 256px, 100vw"
                      }
                      className={cn(
                        "aspect-video w-full shrink-0 rounded-xl object-cover",
                        grid ? "basis-full" : "max-sm:basis-full sm:w-64"
                      )}
                    />
                  ) : null}
                  <FieldContent>
                    <FieldTitle>
                      {t(`templates.${template.id}.label`)}
                    </FieldTitle>
                    <FieldDescription className={cn(grid && "line-clamp-4")}>
                      {t(`templates.${template.id}.description`)}
                    </FieldDescription>
                  </FieldContent>
                  <RadioGroupItem value={template.id} id={id} />
                </Field>
              </FieldLabel>
            )
          })}
        </RadioGroup>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          {t("templateDialogCancel")}
        </DialogClose>
        <Button type="button" onClick={() => onValueChange(marked)}>
          {t("templateDialogSelect")}
        </Button>
      </DialogFooter>
    </>
  )
}
