import { Icon } from "../icons"
import { stepperTestIds } from "./StepperTestIds"
import s from "./Stepper.module.css"

/** A − / + stepper for a count. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div class={s.stepper} role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer ${label.toLowerCase()}`}
        data-testid={stepperTestIds.fewerButton}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" />
      </button>
      <span class={s.value} aria-live="polite" data-testid={stepperTestIds.value}>
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label.toLowerCase()}`}
        data-testid={stepperTestIds.moreButton}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" />
      </button>
    </div>
  )
}
