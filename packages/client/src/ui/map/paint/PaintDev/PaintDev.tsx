import { usePaint } from "../../MapView/MapView"
import { Card } from "../../../Card/Card"
import { formatDistance } from "../../../format"
import kit from "../../../kit.module.css"
import { PaintBlobs } from "../PaintBlobs/PaintBlobs"
import s from "./PaintDev.module.css"

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
        onInput={(v) => (paint.strength.value = v)}
        format={(v) => `${v.toFixed(1)}×`}
      />
      <Slider
        label="World floor"
        min={0}
        max={0.5}
        step={0.01}
        value={paint.floor.value}
        onInput={(v) => (paint.floor.value = v)}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <p class={kit.hint}>
        Tolerance {formatDistance(paint.tolerance.value)} · finest H3 res {stats.res} · {stats.size} cells
        {stats.size > 0 && <> ({stats.resolutionCounts.map(([r, n]) => `res ${r}: ${n}`).join(", ")})</>}
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
  onInput: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <div class={s.row}>
      <label>{props.label}</label>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
      />
      <output>{props.format(props.value)}</output>
    </div>
  )
}
