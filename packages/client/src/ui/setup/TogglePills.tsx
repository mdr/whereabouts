import { togglePillsTestIds } from "./TogglePillsTestIds"
import s from "./pill-row.module.css"

/** Like Pills, but any number of options may be on, at least one. */
export function TogglePills<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: readonly T[]
  onChange: (value: T[]) => void
}) {
  return (
    <div class={s.pills} role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            class={on ? s.on : undefined}
            disabled={on && value.length === 1}
            onClick={() =>
              onChange(options.map((p) => p.value).filter((v) => (v === o.value ? !on : value.includes(v))))
            }
            data-testid={togglePillsTestIds.option}
            data-value={o.value}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
