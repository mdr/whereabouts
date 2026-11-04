import { ReviewCaseType, type ReviewCase } from "@whereabouts/shared/scoring/score-review"
import type { ScoreVerdict } from "@whereabouts/shared/scoring/score-verdict"
import { Card } from "../../../ui/Card/Card"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { onActivateKey } from "../../../keyboard/activate-key"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import players from "../../../ui/players/Players.module.css"
import { reviewSet, scoreVerdicts } from "../../../settings/settings"
import { PAIR_COLOURS } from "../pair-colours"
import { verdictCardTestIds } from "./VerdictCardTestIds"
import styles from "./VerdictCard.module.css"

export type Choice = -2 | -1 | 0 | 1 | 2

const FAIRNESS: { value: Choice; label: string }[] = [
  { value: -2, label: "Much too low" },
  { value: -1, label: "Too low" },
  { value: 0, label: "About right" },
  { value: 1, label: "Too high" },
  { value: 2, label: "Much too high" }
]

const PREFERENCE: { value: Choice; label: string }[] = [
  { value: -2, label: "A, clearly" },
  { value: -1, label: "A, a little" },
  { value: 0, label: "About the same" },
  { value: 1, label: "B, a little" },
  { value: 2, label: "B, clearly" }
]

/** The playtester's side of the review: the verdict, a note, and the progress through the set. */
export const VerdictCard = ({
  reviewCase,
  scores,
  choice,
  onChoose,
  shouldBe,
  onShouldBe,
  note,
  onNote,
  pinned,
  onPin,
  onHover,
  judged,
  total,
  set
}: {
  reviewCase: ReviewCase
  scores: number[]
  choice: Choice | undefined
  onChoose: (choice: Choice) => void
  shouldBe: string
  onShouldBe: (shouldBe: string) => void
  note: string
  onNote: (note: string) => void
  /** In a pair, the one guess shown alone: pinned by a click. */
  pinned: 0 | 1 | undefined
  onPin: (pinned: 0 | 1 | undefined) => void
  onHover: (hovered: 0 | 1 | undefined) => void
  judged: number
  total: number
  set: number
}) => {
  const done = judged >= total
  const options = reviewCase.type === ReviewCaseType.SINGLE ? FAIRNESS : PREFERENCE
  const ownVerdicts = scoreVerdicts.value
  return (
    <Card
      title={reviewCase.type === ReviewCaseType.SINGLE ? "Is this score fair?" : "Which deserves more?"}
      class={styles.review}
    >
      {reviewCase.type === ReviewCaseType.PAIR && (
        <ul class={cx(players.list, players.pick)} data-testid={verdictCardTestIds.pair}>
          {(["A", "B"] as const).map((name, i) => (
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- A list item cannot take a button role, so the row is made focusable and keyed instead.
            <li
              data-testid={verdictCardTestIds.pairGuess}
              class={pinned === i ? players.selected : undefined}
              aria-current={pinned === i}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- As above.
              tabIndex={0}
              onClick={() => onPin(pinned === i ? undefined : (i as 0 | 1))}
              onKeyDown={onActivateKey(() => onPin(pinned === i ? undefined : (i as 0 | 1)))}
              onPointerEnter={(event) => event.pointerType === "mouse" && onHover(i as 0 | 1)}
              onPointerLeave={(event) => event.pointerType === "mouse" && onHover(undefined)}
            >
              <Swatch type={SwatchType.CSS} css={PAIR_COLOURS[i]!} />
              <span class={players.name}>{name}</span>
              <span class={players.roundScore} data-testid={verdictCardTestIds.pairScore}>
                {Math.round(scores[i]!)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div class={styles.verdicts} role="radiogroup">
        {options.map((option, i) => (
          <button
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            class={choice === option.value ? styles.selected : undefined}
            onClick={() => onChoose(option.value)}
            data-testid={verdictCardTestIds.verdict}
            data-verdict={option.value}
          >
            <kbd>{i + 1}</kbd> {option.label}
          </button>
        ))}
      </div>
      {reviewCase.type === ReviewCaseType.SINGLE && (
        <label class={styles.shouldBe}>
          It should be about
          <input
            type="number"
            data-testid={verdictCardTestIds.shouldBeInput}
            min={0}
            max={1000}
            step={10}
            value={shouldBe}
            onInput={(event) => onShouldBe(event.currentTarget.value)}
            placeholder="optional"
          />
        </label>
      )}
      <textarea
        rows={2}
        data-testid={verdictCardTestIds.noteInput}
        value={note}
        onInput={(event) => onNote(event.currentTarget.value)}
        placeholder="Why? (optional)"
      />
      <p class={kit.hint} data-testid={verdictCardTestIds.progress}>
        {judged} of {total} judged in this set
        {done ? ": all done." : "."}
        {reviewCase.type === ReviewCaseType.PAIR && " Point at A or B to see it alone; click to keep it."}
      </p>
      <div class={styles.actions}>
        <button
          type="button"
          onClick={() => exportVerdicts(ownVerdicts)}
          disabled={ownVerdicts.length === 0}
          data-testid={verdictCardTestIds.exportButton}
        >
          Export {ownVerdicts.length} verdict{ownVerdicts.length === 1 ? "" : "s"}
        </button>
        {done && (
          <button type="button" onClick={() => (reviewSet.value = set + 1)}>
            Next set
          </button>
        )}
      </div>
    </Card>
  )
}

const exportVerdicts = (verdicts: ScoreVerdict[]): void => {
  const text = verdicts.map((verdict) => JSON.stringify(verdict)).join("\n") + "\n"
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }))
  link.download = `score-verdicts-${new Date().toISOString().slice(0, 10)}.jsonl`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
