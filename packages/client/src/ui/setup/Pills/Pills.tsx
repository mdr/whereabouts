import { useRadioGroup } from "../../../keyboard/use-radio-group"
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
}) => {
  const radio = useRadioGroup({
    checkedIndex: options.findIndex((option) => option.value === value),
    select: (index) => onChange(options[index]!.value)
  })
  return (
    <div class={styles.pills} role="radiogroup" aria-label={label} {...radio.groupProps}>
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={radio.tabIndex(index)}
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
}
