import { useEffect, useState } from "preact/hooks"
import { usePaint } from "../MapView/MapView"
import { Icon } from "../../icons"
import { trimPaint } from "../../../paint/paint-commands"
import { ToolLabel } from "./ToolLabel/ToolLabel"

/**
 * Remove paint more than about 20 km out to sea, or in a lake or sea round
 * that far onto land, as one undoable step. The mask loads on the first
 * press. For a moment the button says what it did. It does not promise a
 * better score: a blob centred on a coastal answer loses its sea side (see
 * land.ts).
 */
export function Trim({ enabled, water }: { enabled: boolean; water: boolean }) {
  const paint = usePaint()
  const [note, setNote] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(undefined), 2500)
    return () => clearTimeout(timer)
  }, [note])
  const trim = async () => {
    setBusy(true)
    try {
      setNote(await trimPaint(paint, water))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      title={
        water
          ? "Remove paint on land, more than about 20 km from water (Undo brings it back)"
          : "Remove paint out at sea, more than about 20 km from land (Undo brings it back)"
      }
      onClick={() => void trim()}
      disabled={!enabled || busy || paint.isEmpty.value}
      aria-live="polite"
    >
      <Icon name={water ? "land" : "sea"} /> <ToolLabel>{note ?? (water ? "Trim land" : "Trim sea")}</ToolLabel>
    </button>
  )
}
