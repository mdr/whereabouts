import type { Signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { showBorders, showDetail, showInlandWater, showLabels } from "../settings";

function Check({ s, children }: { s: Signal<boolean>; children: ComponentChildren }) {
  return (
    <label>
      <input type="checkbox" checked={s.value} onChange={(e) => (s.value = (e.target as HTMLInputElement).checked)} /> {children}
    </label>
  );
}

export function DifficultyOptions({ extra }: { extra?: ComponentChildren }) {
  return (
    <div class="card options">
      <h2>Difficulty</h2>
      <Check s={showLabels}>Show place names</Check>
      <Check s={showBorders}>Show country borders</Check>
      <Check s={showDetail}>Show roads, buildings and urban areas</Check>
      <Check s={showInlandWater}>Show rivers and lakes</Check>
      {extra}
    </div>
  );
}

export { Check };
