import { MAP_DETAILS, type MapDetail } from "@whereabouts/shared/protocol"
import { MAP_PREVIEWS } from "../map-previews"
import styles from "./MapDetailSummary.module.css"

/** The chosen level as a picture with its name and what it adds. */
export function MapDetailSummary({ value }: { value: MapDetail }) {
  const d = MAP_DETAILS.find((m) => m.id === value) ?? MAP_DETAILS[0]!
  return (
    <>
      <img class={styles.summaryPicture} src={MAP_PREVIEWS[d.id]} alt="" />
      <span class={styles.summaryText}>
        <span class={styles.summaryValue}>{d.label}</span>
        <span class={styles.summaryLabel}>map · {d.detail.toLowerCase()}</span>
      </span>
    </>
  )
}
