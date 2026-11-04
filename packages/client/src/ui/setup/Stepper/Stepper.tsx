import { Icon } from "../../icons"
import { stepperTestIds } from "./StepperTestIds"
import styles from "./Stepper.module.css"

/** A − / + stepper for a count. */
export const Stepper = ({
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
}) => (
  <div class={styles.stepper} role="group" aria-label={label}>
    <button
      type="button"
      aria-label={`Fewer ${label}`}
      data-testid={stepperTestIds.fewerButton}
      disabled={value <= min}
      onClick={() => onChange(value - 1)}
    >
      <Icon name="minus" />
    </button>
    {/* Told as "3 Landmarks" when it changes, not a bare number. */}
    <span class={styles.value} aria-live="polite" aria-atomic="true">
      <span data-testid={stepperTestIds.value}>{value}</span>
      <span class="sr-only">{` ${label}`}</span>
    </span>
    <button
      type="button"
      aria-label={`More ${label}`}
      data-testid={stepperTestIds.moreButton}
      disabled={value >= max}
      onClick={() => onChange(value + 1)}
    >
      <Icon name="plus" />
    </button>
  </div>
)
