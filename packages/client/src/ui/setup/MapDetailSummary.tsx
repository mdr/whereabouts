import { MAP_DETAILS, type MapDetail } from "@whereabouts/shared/protocol"
import { MAP_PREVIEWS } from "./map-previews"
import s from "./MapDetailSummary.module.css"

/** The chosen level as a picture with its name and what it adds. */
export function MapDetailSummary({ value }: { value: MapDetail }) {
  const d = MAP_DETAILS.find((m) => m.id === value) ?? MAP_DETAILS[0]!
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
