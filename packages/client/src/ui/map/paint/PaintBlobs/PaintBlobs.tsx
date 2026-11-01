import { usePaint } from "../../MapView/MapView"
import { paintBlobsTestIds } from "./PaintBlobsTestIds"
import styles from "./PaintBlobs.module.css"

/** Mass per connected blob plus the floor. Re-renders on paint changes. */
export function PaintBlobs() {
  const paint = usePaint()
  const floor = paint.floor.value
  const blobs = paint.settledBlobs.value
  const empty = blobs.length === 0
  const painted = empty ? 0 : 1 - floor
  const effectiveFloor = empty ? 1 : floor
  const shown = blobs.slice(0, 6)
  const rest = blobs.slice(6).reduce((sum, blob) => sum + blob.fraction, 0) * painted * 100
  return (
    <ul class={styles.blobs} data-testid={paintBlobsTestIds.blobs}>
      {shown.map((blob, i) => {
        const percent = blob.fraction * painted * 100
        return (
          <li key={i}>
            <span>
              Blob {i + 1} <span>({blob.cells} cells)</span>
            </span>
            <span class={styles.bar}>
              <i style={{ width: `${percent}%` }} />
            </span>
            <span>{percent.toFixed(1)}%</span>
          </li>
        )
      })}
      {blobs.length > shown.length && (
        <li class={styles.muted}>
          <span>{blobs.length - shown.length} more blobs</span>
          <span class={styles.bar}>
            <i style={{ width: `${rest}%` }} />
          </span>
          <span>{rest.toFixed(1)}%</span>
        </li>
      )}
      <li class={styles.floor}>
        <span>World floor</span>
        <span class={styles.bar}>
          <i style={{ width: `${effectiveFloor * 100}%` }} />
        </span>
        <span>{(effectiveFloor * 100).toFixed(1)}%</span>
      </li>
    </ul>
  )
}
