/**
 * Host settings controls that read at a glance: a row of pills for a small
 * set of choices, a − / + stepper for a count, and a slider with fixed stops
 * for a choice along a scale.
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
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" />
      </button>
      <span class="value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}

/**
 * A slider that snaps to fixed stops, named at both ends with the current
 * stop above. It reports only when it lands on a different stop, so a drag
 * sends a handful of changes rather than one per pixel.
 */
export function StopSlider<T extends string | number>({
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
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div class="stop-slider">
      <div class="current" aria-hidden="true">
        {options[index]?.label}
      </div>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        aria-label={label}
        aria-valuetext={options[index]?.label}
        onInput={(e) => {
          const i = Number((e.target as HTMLInputElement).value);
          if (i !== index && options[i]) onChange(options[i].value);
        }}
      />
      <div class="ticks" aria-hidden="true">
        {options.map((o) => (
          <span key={String(o.value)} class={o.value === value ? "on" : ""} />
        ))}
      </div>
      <div class="ends" aria-hidden="true">
        <span>{options[0]?.label}</span>
        <span>{options[options.length - 1]?.label}</span>
      </div>
    </div>
  );
}
