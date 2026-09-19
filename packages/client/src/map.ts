import { Map as MapLibreMap, NavigationControl, type GeoJSONSource } from "maplibre-gl";
import type * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { EARTH_RADIUS_KM, type LatLon } from "@whereabouts/shared";
import type { Theme } from "./themes";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const PAINT_SOURCE = "paint";
const REVEAL_SOURCE = "reveal";

/** World circumference at the equator in metres, for metres-per-pixel maths. */
const WORLD_M = 40075016.686;
/** MapLibre's world is 512 px wide at zoom 0. */
const WORLD_PX_Z0 = 512;

export class GameMap {
  readonly map: MapLibreMap;
  readonly ready: Promise<void>;
  private labelLayers: string[] = [];
  private borderLayers: string[] = [];
  /** Roads, railways, buildings, airports, urban land use: man-made hints. */
  private detailLayers: string[] = [];
  /** River lines; lakes are handled by filtering the shared water layer. */
  private waterwayLayers: string[] = [];
  private waterFilter: unknown = undefined;
  private styleLayers: { id: string; type: string; sourceLayer: string }[] = [];

  constructor(container: string) {
    this.map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: [10, 25],
      zoom: 1.6,
      minZoom: 1,
      maxZoom: 15,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    this.map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    this.map.keyboard.disableRotation();
    this.ready = new Promise((resolve) => {
      this.map.once("load", () => {
        this.indexStyleLayers();
        this.addSources();
        resolve();
      });
    });
  }

  private indexStyleLayers(): void {
    const layers = this.map.getStyle().layers ?? [];
    const detailSources = new Set(["transportation", "building", "aeroway", "landuse", "park"]);
    for (const l of layers) {
      this.styleLayers.push({ id: l.id, type: l.type, sourceLayer: "source-layer" in l ? (l["source-layer"] ?? "") : "" });
      if (l.type === "symbol") this.labelLayers.push(l.id);
      else if (l.id.startsWith("boundary")) this.borderLayers.push(l.id);
      else if ("source-layer" in l && detailSources.has(l["source-layer"] ?? "")) this.detailLayers.push(l.id);
      else if ("source-layer" in l && l["source-layer"] === "waterway") this.waterwayLayers.push(l.id);
      else if (l.id === "water") this.waterFilter = this.map.getFilter("water");
    }
  }

  private addSources(): void {
    this.map.addSource(PAINT_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addLayer({
      id: "paint-fill",
      type: "fill",
      source: PAINT_SOURCE,
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "v"],
          0, "#ffe082",
          0.35, "#ffa726",
          0.7, "#f4511e",
          1, "#b71c1c",
        ],
        "fill-opacity": ["interpolate", ["linear"], ["get", "v"], 0, 0.2, 1, 0.8],
        "fill-antialias": true,
      },
    });

    this.map.addSource(REVEAL_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addLayer({
      id: "reveal-rings",
      type: "line",
      source: REVEAL_SOURCE,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": "#1565c0",
        "line-width": ["match", ["get", "ring"], 1, 2.5, 1.2],
        "line-dasharray": [2, 2],
        "line-opacity": 0.9,
      },
    });
    this.map.addLayer({
      id: "reveal-answer",
      type: "circle",
      source: REVEAL_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 7,
        "circle-color": "#1565c0",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
  }

  applyTheme(t: Theme): void {
    const set = (id: string, prop: string, value: unknown) => {
      if (this.map.getLayer(id)) this.map.setPaintProperty(id, prop as never, value as never);
    };
    for (const l of this.styleLayers) {
      if (l.type === "background") set(l.id, "background-color", t.land);
      else if (l.id === "water") set(l.id, "fill-color", t.water);
      else if (l.id === "landcover_wood") set(l.id, "fill-color", t.wood);
      else if (l.id.startsWith("landcover_")) set(l.id, "fill-color", t.ice);
      else if (l.sourceLayer === "waterway" && l.type === "line") set(l.id, "line-color", t.waterway);
      else if (l.id.startsWith("boundary")) set(l.id, "line-color", t.border);
      else if (l.type === "symbol") {
        set(l.id, "text-color", t.labelText);
        set(l.id, "text-halo-color", t.labelHalo);
      } else if (["transportation", "aeroway"].includes(l.sourceLayer)) {
        if (l.type === "line") set(l.id, "line-color", t.road);
        else if (l.type === "fill") set(l.id, "fill-color", t.road);
      } else if (["landuse", "park", "building"].includes(l.sourceLayer)) {
        set(l.id, "fill-color", t.urban);
        if (l.id === "building") set(l.id, "fill-outline-color", t.urban);
      }
    }
    set("paint-fill", "fill-color", [
      "interpolate", ["linear"], ["get", "v"],
      0, t.ramp[0], 1 / 3, t.ramp[1], 2 / 3, t.ramp[2], 1, t.ramp[3],
    ]);
    set("paint-fill", "fill-opacity", ["interpolate", ["linear"], ["get", "v"], 0, t.rampOpacity[0], 1, t.rampOpacity[1]]);
    set("reveal-rings", "line-color", t.answer);
    set("reveal-answer", "circle-color", t.answer);
    set("reveal-answer", "circle-stroke-color", t.answerStroke);
    document.documentElement.style.setProperty("--ring-brush", t.brush);
    document.documentElement.style.setProperty("--ring-tol", t.answer);
  }

  setLabels(on: boolean): void {
    for (const id of this.labelLayers) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  setDetail(on: boolean): void {
    for (const id of this.detailLayers) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  /** Rivers and lakes. Oceans always stay visible so coastlines remain. */
  setInlandWater(on: boolean): void {
    for (const id of this.waterwayLayers) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    if (!this.map.getLayer("water")) return;
    const base = this.waterFilter as maplibregl.FilterSpecification | undefined;
    const oceanOnly = ["==", ["get", "class"], "ocean"] as unknown as maplibregl.FilterSpecification;
    const combined = (base ? ["all", base, oceanOnly] : oceanOnly) as unknown as maplibregl.FilterSpecification;
    this.map.setFilter("water", on ? base ?? null : combined);
  }

  setBorders(on: boolean): void {
    for (const id of this.borderLayers) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map.getSource(id) as GeoJSONSource | undefined;
  }

  setPaint(data: GeoJSON.FeatureCollection): void {
    this.source(PAINT_SOURCE)?.setData(data);
  }

  /** Marker at the answer plus rings at 1r and 2r. */
  showReveal(answer: LatLon, toleranceKm: number): void {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [answer.lon, answer.lat] },
        },
        circleFeature(answer, toleranceKm, 1),
        circleFeature(answer, toleranceKm * 2, 2),
      ],
    };
    this.source(REVEAL_SOURCE)?.setData(fc);
  }

  clearReveal(): void {
    this.source(REVEAL_SOURCE)?.setData({
      type: "FeatureCollection",
      features: [],
    });
  }

  metersPerPixel(lat: number): number {
    const z = this.map.getZoom();
    return (WORLD_M * Math.cos((lat * Math.PI) / 180)) / (WORLD_PX_Z0 * Math.pow(2, z));
  }

  /** Ease so that about eight tolerances span 40% of the viewport width. */
  focusOn(answer: LatLon, toleranceKm: number): void {
    const widthPx = this.map.getContainer().clientWidth;
    const cos = Math.max(0.05, Math.cos((answer.lat * Math.PI) / 180));
    const targetMpp = (toleranceKm * 8 * 1000) / (0.4 * widthPx);
    const zoom = Math.log2((WORLD_M * cos) / (WORLD_PX_Z0 * targetMpp));
    this.map.easeTo({
      center: [answer.lon, answer.lat],
      zoom: Math.min(this.map.getMaxZoom(), Math.max(this.map.getMinZoom(), zoom)),
      duration: 900,
    });
  }
}

/** Polygon approximating a circle of `radiusKm` around `centre` on the sphere. */
function circleFeature(centre: LatLon, radiusKm: number, ring: number): GeoJSON.Feature {
  const n = 96;
  const coords: [number, number][] = [];
  const lat1 = (centre.lat * Math.PI) / 180;
  const lon1 = (centre.lon * Math.PI) / 180;
  const d = radiusKm / EARTH_RADIUS_KM;
  let prevLon: number | null = null;
  for (let i = 0; i <= n; i++) {
    const brg = (2 * Math.PI * i) / n;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    let lon2 =
      lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    let lonDeg = (lon2 * 180) / Math.PI;
    // Unwrap across the antimeridian so the ring stays a simple polygon.
    if (prevLon !== null) {
      while (lonDeg - prevLon > 180) lonDeg -= 360;
      while (lonDeg - prevLon < -180) lonDeg += 360;
    }
    prevLon = lonDeg;
    coords.push([lonDeg, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    properties: { ring },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}
