/**
 * Host settings controls that read at a glance: a row of pills for a small
 * set of choices, and a − / + stepper for a count.
 */
import { Icon } from "./icons";
import { pillsTestIds, stepperTestIds } from "./ControlsTestIds";

export function Pills<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
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
          onClick={() => onChange(o.value)}
          data-testid={pillsTestIds.option}
          data-value={o.value}
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
  onChange: (value: number) => void;
}) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer ${label.toLowerCase()}`}
        data-testid={stepperTestIds.fewerButton}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" />
      </button>
      <span class="value" aria-live="polite" data-testid={stepperTestIds.value}>
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
  );
}
