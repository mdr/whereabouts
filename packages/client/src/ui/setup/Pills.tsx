import { pillsTestIds } from "./PillsTestIds"
import s from "./pill-row.module.css"

/** A row of pills for a small set of choices, one on. */
export function Pills<T extends string | number>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div class={s.pills} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? s.on : undefined}
          onClick={() => onChange(o.value)}
          data-testid={pillsTestIds.option}
          data-value={o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
