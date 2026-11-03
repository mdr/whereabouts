import { pillsTestIds } from "./PillsTestIds"
import styles from "../pill-row.module.css"

/** A row of pills for a small set of choices, one on. */
export const Pills = <T extends string | number>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T | undefined
  onChange: (value: T) => void
}) => (
  <div class={styles.pills} role="radiogroup" aria-label={label}>
    {options.map((option) => (
      <button
        key={String(option.value)}
        type="button"
        role="radio"
        aria-checked={option.value === value}
        class={option.value === value ? styles.on : undefined}
        onClick={() => onChange(option.value)}
        data-testid={pillsTestIds.option}
        data-value={option.value}
      >
        {option.label}
      </button>
    ))}
  </div>
)
