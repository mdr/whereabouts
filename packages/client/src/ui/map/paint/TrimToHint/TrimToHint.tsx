import { useEffect, useState } from "preact/hooks"
import type { HintBand } from "@whereabouts/shared/hints"
import { usePaint } from "../../MapView/MapView"
import { Icon } from "../../../icons"
import { trimPaintToHint } from "../../../../paint/paint-commands"
import { ToolLabel } from "../ToolLabel/ToolLabel"
import { trimToHintTestIds } from "./TrimToHintTestIds"

/** Remove the paint outside the hint's band, as one undoable step. For a moment the button says what it did. */
export const TrimToHint = ({ enabled, band }: { enabled: boolean; band: HintBand }) => {
  const paint = usePaint()
  const [note, setNote] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(undefined), 2500)
    return () => clearTimeout(timer)
  }, [note])
  return (
    <button
      title="Remove paint outside the hint's band (Undo brings it back)"
      onClick={() => setNote(trimPaintToHint(paint, band))}
      disabled={!enabled || paint.isEmpty.value}
      aria-live="polite"
      data-testid={trimToHintTestIds.trimToHintButton}
    >
      <Icon name="hint" /> <ToolLabel>{note ?? "Trim to hint"}</ToolLabel>
    </button>
  )
}
