/** The round's hint: a band of latitude or longitude the answer lies in, shaded on the map once used. */
import { describeHint, HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { Card } from "../../Card/Card"
import { Icon, type IconName } from "../../icons"
import { hintTestIds } from "./HintTestIds"
import styles from "./Hint.module.css"

const AXIS_ICON: Record<HintAxis, IconName> = { [HintAxis.LATITUDE]: "latitude", [HintAxis.LONGITUDE]: "longitude" }

/** `left` is how many the player has; undefined in practice, where they are unlimited. */
export function HintCard({
  band,
  left,
  disabled,
  onUse
}: {
  band?: HintBand
  left?: number
  disabled?: boolean
  onUse: (axis: HintAxis) => void
}) {
  if (band) {
    return (
      <Card class={styles.card}>
        <p class={styles.band} data-testid={hintTestIds.band}>
          <Icon name={AXIS_ICON[band.axis]} size={14} /> {describeHint(band)}
        </p>
      </Card>
    )
  }
  if (left === 0) return undefined
  return (
    <Card class={styles.card}>
      <div class={styles.choose} data-testid={hintTestIds.card}>
        <span class={styles.label}>
          <Icon name="hint" size={14} /> Hint
          {left !== undefined && <span class={styles.left}>{left} left</span>}
        </span>
        <button
          type="button"
          class="small"
          title="Show a band of latitude the answer lies in"
          disabled={disabled}
          onClick={() => onUse(HintAxis.LATITUDE)}
          data-testid={hintTestIds.latitude}
        >
          <Icon name="latitude" /> Latitude
        </button>
        <button
          type="button"
          class="small"
          title="Show a band of longitude the answer lies in"
          disabled={disabled}
          onClick={() => onUse(HintAxis.LONGITUDE)}
          data-testid={hintTestIds.longitude}
        >
          <Icon name="longitude" /> Longitude
        </button>
      </div>
    </Card>
  )
}
