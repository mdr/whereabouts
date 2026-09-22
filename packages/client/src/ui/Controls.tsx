/**
 * Settings controls that read at a glance: a row of pills for a small set of
 * choices, and a − / + stepper for a count. Without an onChange they show
 * the current value read-only, so guests see exactly what the host picked.
 */
import { Icon } from "./icons";

export function Pills<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange?: (value: T) => void;
}) {
  return (
    <div class="pills" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? "on" : ""}
          disabled={!onChange}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange?: (value: number) => void;
}) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      {onChange && (
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Icon name="minus" />
        </button>
      )}
      <span class="value" aria-live="polite">
        {value}
      </span>
      {onChange && (
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Icon name="plus" />
        </button>
      )}
    </div>
  );
}
