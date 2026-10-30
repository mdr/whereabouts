import { MAP_DETAILS, type MapDetail } from "@whereabouts/shared/protocol"
import minimal from "../assets/map-minimal.jpg"
import water from "../assets/map-water.jpg"
import physical from "../assets/map-physical.jpg"
import political from "../assets/map-political.jpg"
import { cx } from "./cx"
import { mapDetailPickerTestIds } from "./MapDetailPickerTestIds"
import s from "./MapDetailPicker.module.css"

/** The same frame at each level, from scripts/map-detail-previews.mjs. */
const MAP_PREVIEWS: Record<MapDetail, string> = { minimal, water, physical, political }

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

/** The chosen level as a picture with its name and what it adds. */
export function MapDetailSummary({ value }: { value: MapDetail }) {
  const d = MAP_DETAILS.find((m) => m.id === value) ?? MAP_DETAILS[0]
  return (
    <>
      <img class={s.summaryPicture} src={MAP_PREVIEWS[d.id]} alt="" />
      <span class={s.summaryText}>
        <span class={s.summaryValue}>{d.label}</span>
        <span class={s.summaryLabel}>map · {d.detail.toLowerCase()}</span>
      </span>
    </>
  )
}
