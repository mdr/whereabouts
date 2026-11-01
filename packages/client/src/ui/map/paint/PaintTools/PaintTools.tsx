import type { ComponentChildren } from "preact"
import type { HintBand } from "@whereabouts/shared/hints"
import { usePaint } from "../../MapView/MapView"
import { HudBottom } from "../../Hud/Hud"
import styles from "./PaintTools.module.css"
import { Tool } from "../../../../paint/tool"
import { Icon, type IconName } from "../../../icons"
import { clearPaint } from "../../../../paint/paint-commands"
import { Shortcuts } from "../../Shortcuts/Shortcuts"
import { ShortcutsButton } from "../../ShortcutsButton/ShortcutsButton"
import { paintToolsTestIds } from "./PaintToolsTestIds"
import { PASS_NOTE } from "../../../../round/round-words"
import { ToolLabel } from "../ToolLabel/ToolLabel"
import { Trim } from "../Trim"
import { TrimToHint } from "../TrimToHint/TrimToHint"

const TOOL_ICON: Record<Tool, IconName> = {
  [Tool.PAN]: "hand",
  [Tool.PAINT]: "brush",
  [Tool.ERASE]: "eraser",
  [Tool.FILL]: "bucket"
}
const TOOL_HINT: Record<Tool, string> = {
  [Tool.PAN]: "Pan the map (1). Hold Space to pan while painting.",
  [Tool.PAINT]: "Paint where you think it is (2). Paint again to weight an area more.",
  [Tool.ERASE]: "Erase paint (3)",
  [Tool.FILL]: "Fill a whole country (4). Fill several if unsure; click a filled one to take it off."
}

/**
 * The player-facing brush bar: tool, clear, brush size, undo/redo, and
 * whatever action buttons the screen passes in (done, next).
 *
 * `water`: the answer is a lake or sea, so Trim land replaces Trim sea.
 * `hint`: the band of a hint taken this round, offered as a trim too.
 * `canPass`: done with nothing painted is a pass, so say what that scores.
 */
export function PaintTools({
  children,
  practice,
  water,
  hint,
  canPass
}: {
  children?: ComponentChildren
  practice?: boolean
  water?: boolean
  hint?: HintBand
  canPass?: boolean
}) {
  const paint = usePaint()
  const tool = paint.tool.value
  const enabled = paint.enabled.value
  // Fill only in a round asking for a country, on the Political map.
  const tools: Tool[] = paint.fillable.value
    ? [Tool.PAN, Tool.PAINT, Tool.ERASE, Tool.FILL]
    : [Tool.PAN, Tool.PAINT, Tool.ERASE]
  return (
    <HudBottom note={canPass && paint.isEmpty.value ? PASS_NOTE : undefined}>
      <div class={styles.tools}>
        {tools.map((t) => (
          <button
            key={t}
            class={tool === t ? "active" : undefined}
            aria-pressed={tool === t}
            title={TOOL_HINT[t]}
            onClick={() => (paint.tool.value = t)}
            disabled={!enabled}
            data-testid={paintToolsTestIds.toolButton}
            data-tool={t}
          >
            <Icon name={TOOL_ICON[t]} /> <ToolLabel>{t[0]!.toUpperCase() + t.slice(1)}</ToolLabel>
          </button>
        ))}
        <button
          title="Clear all paint (Undo brings it back)"
          onClick={() => clearPaint(paint)}
          disabled={!enabled}
          data-testid={paintToolsTestIds.clearButton}
        >
          <Icon name="trash" /> <ToolLabel>Clear</ToolLabel>
        </button>
        <Trim enabled={enabled} water={water ?? false} />
        {hint && <TrimToHint enabled={enabled} band={hint} />}
      </div>
      <label class={styles.brush} title="Brush size ([ and ] also work)">
        <span>Brush</span>
        <input
          type="range"
          min={6}
          max={200}
          step={1}
          value={paint.brushRadius.value}
          disabled={!enabled}
          onInput={(e) => paint.setBrushSize(Number(e.currentTarget.value))}
        />
      </label>
      <span class={styles.history}>
        <button
          class={styles.iconOnly}
          title="Undo (Ctrl+Z or ⌘Z)"
          aria-label="Undo"
          onClick={() => paint.undo()}
          disabled={!enabled || !paint.canUndo.value}
        >
          <Icon name="undo" />
        </button>
        <button
          class={styles.iconOnly}
          title="Redo (Ctrl+Shift+Z, ⌘⇧Z or Ctrl+Y)"
          aria-label="Redo"
          onClick={() => paint.redo()}
          disabled={!enabled || !paint.canRedo.value}
        >
          <Icon name="redo" />
        </button>
      </span>
      <ShortcutsButton />
      <Shortcuts practice={practice} />
      {children}
    </HudBottom>
  )
}
