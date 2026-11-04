import { MAP_DETAILS, type MapDetail } from "@whereabouts/shared/protocol/config"
import { useRadioGroup } from "../../../keyboard/use-radio-group"
import { cx } from "../../cx"
import { MAP_PREVIEWS } from "../map-previews"
import { mapDetailPickerTestIds } from "./MapDetailPickerTestIds"
import styles from "./MapDetailPicker.module.css"

/** Map detail as four picture choices, least detail (hardest) first; `narrow`, as two rows of two. */
export const MapDetailPicker = ({
  value,
  onChange,
  narrow
}: {
  value: MapDetail
  onChange: (value: MapDetail) => void
  narrow?: boolean
}) => {
  const radio = useRadioGroup({
    checkedIndex: MAP_DETAILS.findIndex((detail) => detail.id === value),
    select: (index) => onChange(MAP_DETAILS[index]!.id)
  })
  return (
    <div
      class={cx(styles.picker, narrow && styles.narrow)}
      role="radiogroup"
      aria-label="Map detail"
      data-testid={mapDetailPickerTestIds.picker}
      {...radio.groupProps}
    >
      {MAP_DETAILS.map((detail, index) => (
        <button
          key={detail.id}
          type="button"
          role="radio"
          aria-checked={detail.id === value}
          tabIndex={radio.tabIndex(index)}
          class={detail.id === value ? styles.on : undefined}
          title={detail.detail}
          data-testid={mapDetailPickerTestIds.option}
          data-detail={detail.id}
          onClick={() => onChange(detail.id)}
        >
          <img src={MAP_PREVIEWS[detail.id]} alt="" />
          <span class={styles.name}>{detail.label}</span>
        </button>
      ))}
    </div>
  )
}
