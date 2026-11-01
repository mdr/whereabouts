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
}) => {
  return (
    <div class={styles.stepper} role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer ${label.toLowerCase()}`}
        data-testid={stepperTestIds.fewerButton}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" />
      </button>
      <span class={styles.value} aria-live="polite" data-testid={stepperTestIds.value}>
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
