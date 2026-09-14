import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@workspace/ui/components/questionnaire"

import {
  ASK_FIELD,
  type AskOption,
  type AskQuestion,
} from "@/lib/games/ask-player"
import type { AskPlayerOutput } from "@/lib/games/tools"

/**
 * The question the agent stopped its turn to ask, while it is still open.
 *
 * Answering is a submit rather than a click on an option. A radio group the
 * player can revise before committing is the honest shape for a decision that
 * cannot be taken back — once the answer goes to the agent it becomes the
 * premise of everything it builds next.
 */
export function AskPlayer({
  question,
  onAnswer,
}: {
  question: AskQuestion
  onAnswer: (answer: AskPlayerOutput) => void
}) {
  return (
    <Bubble variant="muted" align="start" className="w-full max-w-full">
      {/**
       * Horizontal padding matches `px-3` — the same inset a text bubble's
       * `BubbleContent` uses by default — so the questionnaire's title lines
       * up with every other block in the row instead of sitting 4px further
       * in. Vertical padding stays `py-4`: nothing forces it to match, and the
       * form reads better with more room around it than a line of text needs.
       */}
      <BubbleContent className="w-full !bg-transparent px-3 py-4 dark:!bg-card">
        <Questionnaire
          /**
           * Number keys pick an option, Enter commits. The primitive scopes
           * both to this form, so an old question further up the thread never
           * competes with the composer for a keystroke.
           */
          shortcuts="numbers"
          onSubmit={(event) => {
            event.preventDefault()

            const chosen = new FormData(event.currentTarget).get(ASK_FIELD)
            const option = question.options.find((it) => it.id === chosen)

            if (option) {
              onAnswer({ optionId: option.id, label: option.label })
            }
          }}
        >
          <QuestionnaireItem name={ASK_FIELD} required>
            <QuestionnaireTitle>{question.question}</QuestionnaireTitle>
            <QuestionnaireChoices>
              {question.options.map((option) => (
                <QuestionnaireChoice key={option.id} value={option.id}>
                  {option.label}
                  {option.description ? (
                    <QuestionnaireChoiceDescription>
                      {option.description}
                    </QuestionnaireChoiceDescription>
                  ) : null}
                </QuestionnaireChoice>
              ))}
            </QuestionnaireChoices>
            <QuestionnaireError />
            <QuestionnaireActions>
              <QuestionnaireSubmit size="sm">Continue</QuestionnaireSubmit>
            </QuestionnaireActions>
          </QuestionnaireItem>
        </Questionnaire>
      </BubbleContent>
    </Bubble>
  )
}

/**
 * The same question once it has been answered — a record, not a control.
 *
 * Deliberately not the form in a disabled state. Keeping the radio group
 * around costs the thread a full-height card for every question ever asked,
 * and it lies twice: the options read as offers that are no longer on the
 * table, and the primitive itself stops counting a disabled choice as an
 * answer — which flips the item back to "unanswered" and fires the required
 * error the instant the answer is accepted.
 *
 * A thread is re-rendered from stored history on every reload, so this is what
 * an answered question looks like for the rest of the chat's life. It carries
 * the question as well as the answer, because a bare "Survival Adventure" is
 * not a conversation.
 */
export function AskPlayerAnswer({
  question,
  answer,
}: {
  question: AskQuestion
  answer: AskOption
}) {
  return (
    <Bubble variant="muted" align="start" className="w-full max-w-full">
      {/** Same `px-3` alignment as `AskPlayer`'s `BubbleContent` above. */}
      <BubbleContent className="flex w-full flex-col gap-2 px-3 py-4 dark:!bg-card">
        <p className="text-sm text-pretty text-muted-foreground">
          {question.question}
        </p>
        <p className="flex items-start gap-2 text-sm font-medium">
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className="size-4 shrink-0 translate-y-0.5 text-primary"
          />
          <span className="min-w-0">
            You chose {answer.label}
            {answer.description ? (
              <span className="block font-normal text-muted-foreground">
                {answer.description}
              </span>
            ) : null}
          </span>
        </p>
      </BubbleContent>
    </Bubble>
  )
}
