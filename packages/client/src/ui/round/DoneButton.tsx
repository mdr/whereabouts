import { usePaint } from "../map/MapView/MapView"
import { Icon } from "../icons"

/** Submit or Done; with nothing painted, Pass. */
export function DoneButton({
  label,
  onDone,
  paintedTitle,
  testId
}: {
  label: string
  onDone: () => void
  paintedTitle?: string
  testId: string
}) {
  const paint = usePaint()
  const empty = paint.isEmpty.value
  return (
    <button class="primary" onClick={onDone} title={empty ? undefined : paintedTitle} data-testid={testId}>
      <Icon name="check" /> {empty ? "Pass" : label}
    </button>
  )
}
