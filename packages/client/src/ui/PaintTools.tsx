import type { ComponentChildren } from "preact";
import { usePaint } from "./MapView";
import { Card, fmtKm } from "./bits";
import type { Tool } from "../paint-controller";

const TOOL_HINT: Record<Tool, string> = {
  pan: "Pan the map (1). Hold Space to pan while painting.",
  paint: "Paint where you think it is (2). Paint again to weight an area more.",
  erase: "Erase paint (3)",
};

/**
 * The player-facing brush bar: tool, brush size, and whatever action buttons
 * the screen passes in (clear, lock in, submit).
 */
export function PaintTools({ children }: { children?: ComponentChildren }) {
  const paint = usePaint();
  const tool = paint.tool.value;
  const enabled = paint.enabled.value;
  return (
    <div class="hud-bottom toolbar">
      <div class="tools">
        {(["pan", "paint", "erase"] as Tool[]).map((t) => (
          <button
            key={t}
            class={tool === t ? "active" : ""}
            title={TOOL_HINT[t]}
            onClick={() => (paint.tool.value = t)}
            disabled={!enabled}
          >
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <label class="brush" title="Brush size ([ and ] also work)">
        <span>Brush</span>
        <input
          type="range"
          min={6}
          max={200}
          step={1}
          value={paint.brushPx.value}
          disabled={!enabled}
          onInput={(e) => paint.setBrushPx(Number((e.target as HTMLInputElement).value))}
        />
      </label>
      {children}
    </div>
  );
}

/** Developer-only paint settings and diagnostics. */
export function PaintDev() {
  const paint = usePaint();
  void paint.version.value;
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
      <p class="hint">
        Tolerance {fmtKm(paint.toleranceKm.value)} · finest H3 res {paint.layer.res} · {paint.layer.size} cells
        {paint.layer.size > 0 && (
          <>
            {" "}
            (
            {paint.layer
              .resolutionCounts()
              .map(([r, n]) => `res ${r}: ${n}`)
              .join(", ")}
            )
          </>
        )}
      </p>
      <Distribution />
    </Card>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onInput: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div class="row">
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
  );
}

/** Mass per connected blob plus the floor. Re-renders on paint changes. */
export function Distribution() {
  const paint = usePaint();
  void paint.settledVersion.value;
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
