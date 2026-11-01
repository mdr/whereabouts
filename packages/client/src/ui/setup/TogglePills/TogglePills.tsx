import { togglePillsTestIds } from "./TogglePillsTestIds"
import styles from "../pill-row.module.css"

/** Like Pills, but any number of options may be on, at least one. */
export const TogglePills = <T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: readonly T[]
  onChange: (value: T[]) => void
}) => (
  <div class={styles.pills} role="group" aria-label={label}>
    {options.map((option) => {
      const on = value.includes(option.value)
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={on}
          class={on ? styles.on : undefined}
          disabled={on && value.length === 1}
          onClick={() =>
            onChange(
              options
                .map((candidate) => candidate.value)
                .filter((item) => (item === option.value ? !on : value.includes(item)))
            )
          }
          data-testid={togglePillsTestIds.option}
          data-value={option.value}
        >
          {option.label}
        </button>
      )
    })}
  </div>
)
