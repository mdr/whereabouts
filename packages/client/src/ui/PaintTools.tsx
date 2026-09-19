import { usePaint } from "./MapView";
import { fmtKm } from "./bits";
import { PaintController, type Tool } from "../paint-controller";

export function PaintTools({ onClear }: { onClear?: () => void }) {
  const paint = usePaint();
  const tool = paint.tool.value;
  const setTool = (t: Tool) => (paint.tool.value = t);
  return (
    <>
      <div class="tools">
        {(["pan", "paint", "erase"] as Tool[]).map((t, i) => (
          <button key={t} class={tool === t ? "active" : ""} onClick={() => setTool(t)} disabled={!paint.enabled.value}>
            {t[0]!.toUpperCase() + t.slice(1)} <kbd>{i + 1}</kbd>
          </button>
        ))}
      </div>
      <Slider label="Brush size" min={6} max={200} step={1} value={paint.brushPx.value} onInput={(v) => paint.setBrushPx(v)} format={(v) => `${v} px`} />
      <Slider label="Strength" min={0.2} max={3} step={0.1} value={paint.strength.value} onInput={(v) => (paint.strength.value = v)} format={(v) => `${v.toFixed(1)}×`} />
      <Slider label="World floor" min={0} max={0.5} step={0.01} value={paint.floor.value} onInput={(v) => (paint.floor.value = v)} format={(v) => `${Math.round(v * 100)}%`} />
      {paint.brushClamped.value && (
        <p class="hint warn">
          Brush too large for this tolerance; capped at {PaintController.MAX_BRUSH_RINGS} cells radius. Use the world floor for broad uncertainty.
        </p>
      )}
      <p class="hint">
        <span class="legend solid" /> Brush footprint &nbsp; <span class="legend dashed" /> One tolerance ({fmtKm(paint.toleranceKm.value)}): the distance at which credit halves.
      </p>
      <p class="hint">
        Hold <kbd>Space</kbd> to pan while painting. <kbd>[</kbd> <kbd>]</kbd> resize the brush. Scroll to zoom. Paint again over an area to weight it more.
      </p>
      {onClear && (
        <div class="actions">
          <button class="danger" onClick={onClear} disabled={!paint.enabled.value}>
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function Slider(props: { label: string; min: number; max: number; step: number; value: number; onInput: (v: number) => void; format: (v: number) => string }) {
  return (
    <div class="row">
      <label>{props.label}</label>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(e) => props.onInput(Number((e.target as HTMLInputElement).value))} />
      <output>{props.format(props.value)}</output>
    </div>
  );
}

/** Mass per connected blob plus the floor. Re-renders on paint changes. */
export function Distribution() {
  const paint = usePaint();
  void paint.version.value;
  const floor = paint.floor.value;
  const layer = paint.layer;
  const blobs = layer.blobs();
  const painted = layer.isEmpty ? 0 : 1 - floor;
  const effectiveFloor = layer.isEmpty ? 1 : floor;
  const shown = blobs.slice(0, 6);
  const rest = blobs.slice(6).reduce((s, b) => s + b.fraction, 0) * painted * 100;
  return (
    <ul class="blobs">
      {shown.map((b, i) => {
        const pct = b.fraction * painted * 100;
        return (
          <li key={i}>
            <span>
              Blob {i + 1} <span class="muted">({b.cells} cells)</span>
            </span>
            <span class="bar">
              <i style={{ width: `${pct}%` }} />
            </span>
            <span>{pct.toFixed(1)}%</span>
          </li>
        );
      })}
      {blobs.length > shown.length && (
        <li class="muted">
          <span>{blobs.length - shown.length} more blobs</span>
          <span class="bar">
            <i style={{ width: `${rest}%` }} />
          </span>
          <span>{rest.toFixed(1)}%</span>
        </li>
      )}
      <li class="floor">
        <span>World floor</span>
        <span class="bar">
          <i style={{ width: `${effectiveFloor * 100}%` }} />
        </span>
        <span>{(effectiveFloor * 100).toFixed(1)}%</span>
      </li>
    </ul>
  );
}
