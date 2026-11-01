import { usePaint } from "../../MapView/MapView"
import { Card } from "../../../Card/Card"
import { formatDistance } from "../../../format"
import kit from "../../../kit.module.css"
import { PaintBlobs } from "../PaintBlobs/PaintBlobs"
import styles from "./PaintDev.module.css"

/** Developer-only paint settings and diagnostics. */
export function PaintDev() {
  const paint = usePaint()
  const stats = paint.stats.value
  return (
    <Card title="Paint">
      <Slider
        label="Strength"
        min={0.2}
        max={3}
        step={0.1}
        value={paint.strength.value}
        onInput={(value) => (paint.strength.value = value)}
        format={(value) => `${value.toFixed(1)}×`}
      />
      <Slider
        label="World floor"
        min={0}
        max={0.5}
        step={0.01}
        value={paint.floor.value}
        onInput={(value) => (paint.floor.value = value)}
        format={(value) => `${Math.round(value * 100)}%`}
      />
      <p class={kit.hint}>
        Tolerance {formatDistance(paint.tolerance.value)} · finest H3 res {stats.res} · {stats.size} cells
        {stats.size > 0 && (
          <> ({stats.resolutionCounts.map(([resolution, count]) => `res ${resolution}: ${count}`).join(", ")})</>
        )}
      </p>
      <PaintBlobs />
    </Card>
  )
}

function Slider(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onInput: (value: number) => void
  format: (value: number) => string
}) {
  return (
    <div class={styles.row}>
      <label>{props.label}</label>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(event) => props.onInput(Number(event.currentTarget.value))}
      />
      <output>{props.format(props.value)}</output>
    </div>
  )
}
