/** The round's hint: a band of latitude or longitude the answer lies in, shaded on the map once used. */
import { describeHint, type HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { Card } from "./Card"
import { Icon } from "./icons"
import { hintTestIds } from "./HintTestIds"
import s from "./Hint.module.css"

/** `left` is how many the player has; undefined in practice, where they are unlimited. */
export function HintCard({ band, left, onUse }: { band?: HintBand; left?: number; onUse: (axis: HintAxis) => void }) {
  if (band) {
    return (
      <Card class={s.card}>
        <p class={s.band} data-testid={hintTestIds.band}>
          <Icon name={band.axis} size={14} /> {describeHint(band)}
        </p>
      </Card>
    )
  }
  if (left === 0) return undefined
  return (
    <Card class={s.card}>
      <div class={s.choose} data-testid={hintTestIds.card}>
        <span class={s.label}>
          <Icon name="hint" size={14} /> Hint
          {left !== undefined && <span class={s.left}>{left} left</span>}
        </span>
        <button
          type="button"
          class="small"
          title="Show a band of latitude the answer lies in"
          onClick={() => onUse("latitude")}
          data-testid={hintTestIds.latitude}
        >
          <Icon name="latitude" /> Latitude
        </button>
        <button
          type="button"
          class="small"
          title="Show a band of longitude the answer lies in"
          onClick={() => onUse("longitude")}
          data-testid={hintTestIds.longitude}
        >
          <Icon name="longitude" /> Longitude
        </button>
      </div>
    </Card>
  )
}
