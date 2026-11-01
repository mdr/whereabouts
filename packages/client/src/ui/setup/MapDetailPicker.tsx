import { MAP_DETAILS, type MapDetail } from "@whereabouts/shared/protocol"
import { cx } from "../cx"
import { MAP_PREVIEWS } from "./map-previews"
import { mapDetailPickerTestIds } from "./MapDetailPickerTestIds"
import s from "./MapDetailPicker.module.css"

/** Map detail as four picture choices, least detail (hardest) first; `narrow`, as two rows of two. */
export function MapDetailPicker({
  value,
  onChange,
  narrow
}: {
  value: MapDetail
  onChange: (value: MapDetail) => void
  narrow?: boolean
}) {
  return (
    <div
      class={cx(s.picker, narrow && s.narrow)}
      role="radiogroup"
      aria-label="Map detail"
      data-testid={mapDetailPickerTestIds.picker}
    >
      {MAP_DETAILS.map((d) => (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={d.id === value}
          class={d.id === value ? s.on : undefined}
          title={d.detail}
          onClick={() => onChange(d.id)}
        >
          <img src={MAP_PREVIEWS[d.id]} alt="" />
          <span class={s.name}>{d.label}</span>
        </button>
      ))}
    </div>
  )
}
