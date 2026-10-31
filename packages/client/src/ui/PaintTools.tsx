import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import type { HintBand } from "@whereabouts/shared/hints"
import { usePaint } from "./MapView"
import { Card } from "./Card"
import { formatDistance } from "./format"
import { HudBottom } from "./Hud"
import kit from "./kit.module.css"
import s from "./PaintTools.module.css"
import { Tool } from "../tool"
import { Icon, type IconName } from "./icons"
import { clearPaint, trimPaint, trimPaintToHint } from "../paint-commands"
import { Shortcuts, ShortcutsButton } from "./Shortcuts"
import { paintDevTestIds, paintToolsTestIds } from "./PaintToolsTestIds"
import { PASS_NOTE } from "../round-words"

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
      <div class={s.tools}>
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
            <Icon name={TOOL_ICON[t]} /> <span class={s.label}>{t[0]!.toUpperCase() + t.slice(1)}</span>
          </button>
        ))}
        <button
          title="Clear all paint (Undo brings it back)"
          onClick={() => clearPaint(paint)}
          disabled={!enabled}
          data-testid={paintToolsTestIds.clearButton}
        >
          <Icon name="trash" /> <span class={s.label}>Clear</span>
        </button>
        <Trim enabled={enabled} water={water ?? false} />
        {hint && <TrimToHint enabled={enabled} band={hint} />}
      </div>
      <label class={s.brush} title="Brush size ([ and ] also work)">
        <span>Brush</span>
        <input
          type="range"
          min={6}
          max={200}
          step={1}
          value={paint.brushSize.value}
          disabled={!enabled}
          onInput={(e) => paint.setBrushSize(Number((e.target as HTMLInputElement).value))}
        />
      </label>
      <span class={s.history}>
        <button
          class={s.iconOnly}
          title="Undo (Ctrl+Z or ⌘Z)"
          aria-label="Undo"
          onClick={() => paint.undo()}
          disabled={!enabled || !paint.canUndo.value}
        >
          <Icon name="undo" />
        </button>
        <button
          class={s.iconOnly}
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
      <Distribution />
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
        onInput={(e) => props.onInput(Number((e.target as HTMLInputElement).value))}
      />
      <output>{props.format(props.value)}</output>
    </div>
  )
}

/** Mass per connected blob plus the floor. Re-renders on paint changes. */
function Distribution() {
  const paint = usePaint()
  const floor = paint.floor.value
  const blobs = paint.settledBlobs.value
  const empty = blobs.length === 0
  const painted = empty ? 0 : 1 - floor
  const effectiveFloor = empty ? 1 : floor
  const shown = blobs.slice(0, 6)
  const rest = blobs.slice(6).reduce((s, b) => s + b.fraction, 0) * painted * 100
  return (
    <ul class={s.blobs} data-testid={paintDevTestIds.blobs}>
      {shown.map((b, i) => {
        const pct = b.fraction * painted * 100
        return (
          <li key={i}>
            <span>
              Blob {i + 1} <span>({b.cells} cells)</span>
            </span>
            <span class={s.bar}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <span>{pct.toFixed(1)}%</span>
          </li>
        )
      })}
      {blobs.length > shown.length && (
        <li class={s.muted}>
          <span>{blobs.length - shown.length} more blobs</span>
          <span class={s.bar}>
            <i style={{ width: `${rest}%` }} />
          </span>
          <span>{rest.toFixed(1)}%</span>
        </li>
      )}
      <li class={s.floor}>
        <span>World floor</span>
        <span class={s.bar}>
          <i style={{ width: `${effectiveFloor * 100}%` }} />
        </span>
        <span>{(effectiveFloor * 100).toFixed(1)}%</span>
      </li>
    </ul>
  )
}

/** Remove the paint outside the hint's band, as one undoable step. For a moment the button says what it did. */
function TrimToHint({ enabled, band }: { enabled: boolean; band: HintBand }) {
  const paint = usePaint()
  const [note, setNote] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(undefined), 2500)
    return () => clearTimeout(t)
  }, [note])
  return (
    <button
      title="Remove paint outside the hint's band (Undo brings it back)"
      onClick={() => setNote(trimPaintToHint(paint, band))}
      disabled={!enabled || paint.isEmpty.value}
      aria-live="polite"
      data-testid={paintToolsTestIds.trimToHintButton}
    >
      <Icon name="hint" /> <span class={s.label}>{note ?? "Trim to hint"}</span>
    </button>
  )
}

/**
 * Remove paint more than about 20 km out to sea, or in a lake or sea round
 * that far onto land, as one undoable step. The mask loads on the first
 * press. For a moment the button says what it did. It does not promise a
 * better score: a blob centred on a coastal answer loses its sea side (see
 * land.ts).
 */
function Trim({ enabled, water }: { enabled: boolean; water: boolean }) {
  const paint = usePaint()
  const [note, setNote] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(undefined), 2500)
    return () => clearTimeout(t)
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
      <Icon name={water ? "land" : "sea"} /> <span class={s.label}>{note ?? (water ? "Trim land" : "Trim sea")}</span>
    </button>
  )
}
