import { MAP_DETAILS, type MapDetail } from "@whereabouts/shared/protocol"
import { cx } from "../../cx"
import { MAP_PREVIEWS } from "../map-previews"
import { mapDetailPickerTestIds } from "./MapDetailPickerTestIds"
import styles from "./MapDetailPicker.module.css"

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
      class={cx(styles.picker, narrow && styles.narrow)}
      role="radiogroup"
      aria-label="Map detail"
      data-testid={mapDetailPickerTestIds.picker}
    >
      {MAP_DETAILS.map((detail) => (
        <button
          key={detail.id}
          type="button"
          role="radio"
          aria-checked={detail.id === value}
          class={detail.id === value ? styles.on : undefined}
          title={detail.detail}
          onClick={() => onChange(detail.id)}
        >
          <img src={MAP_PREVIEWS[detail.id]} alt="" />
          <span class={styles.name}>{detail.label}</span>
        </button>
      ))}
    </div>
  )
}
