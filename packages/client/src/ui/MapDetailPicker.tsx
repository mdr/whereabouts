import { MAP_DETAILS, type MapDetail } from "@whereabouts/shared";
import minimal from "../assets/map-minimal.jpg";
import water from "../assets/map-water.jpg";
import physical from "../assets/map-physical.jpg";
import political from "../assets/map-political.jpg";

/** The same frame at each level, from scripts/map-detail-previews.mjs. */
export const MAP_PREVIEWS: Record<MapDetail, string> = { minimal, water, physical, political };

/** Map detail as four picture choices, least detail (hardest) first. */
export function MapDetailPicker({ value, onChange }: { value: MapDetail; onChange: (value: MapDetail) => void }) {
  return (
    <div class="detail-picker" role="radiogroup" aria-label="Map detail">
      {MAP_DETAILS.map((d) => (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={d.id === value}
          class={d.id === value ? "on" : ""}
          title={d.detail}
          onClick={() => onChange(d.id)}
        >
          <img src={MAP_PREVIEWS[d.id]} alt="" />
          <span class="name">{d.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The chosen level as a picture with its name and what it adds. */
export function MapDetailSummary({ value }: { value: MapDetail }) {
  const d = MAP_DETAILS.find((m) => m.id === value) ?? MAP_DETAILS[0];
  return (
    <>
      <img src={MAP_PREVIEWS[d.id]} alt="" />
      <span class="text">
        <span class="value">{d.label}</span>
        <span class="label">map · {d.detail.toLowerCase()}</span>
      </span>
    </>
  );
}
