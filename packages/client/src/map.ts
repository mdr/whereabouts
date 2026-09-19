import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import type * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre resolves its module worker as a sibling of its own script via
// import.meta.url. After bundling that points into /assets where no such
// file exists, so hand it a worker Vite has bundled and knows the URL of.
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { EARTH_RADIUS_KM, type LatLon } from "@whereabouts/shared";
import type { Theme } from "./themes";

setWorkerUrl(mapWorkerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const PAINT_SOURCE = "paint";
const REVEAL_SOURCE = "reveal";

/** World circumference at the equator in metres, for metres-per-pixel maths. */
const WORLD_M = 40075016.686;
const WORLD_CENTER: [number, number] = [10, 25];
const WORLD_ZOOM = 1.6;
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
  private theme: Theme | null = null;

  constructor(container: string | HTMLElement) {
    this.map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: WORLD_CENTER,
      zoom: WORLD_ZOOM,
      minZoom: 1,
      maxZoom: 15,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    // Bottom-left keeps the buttons clear of the HUD cards and the toolbar.
    this.map.addControl(new NavigationControl({ showCompass: false }), "bottom-left");
    this.map.keyboard.disableRotation();
    this.ready = new Promise((resolve) => {
      this.map.once("load", () => {
        this.collapseAttribution();
        this.indexStyleLayers();
        this.addSources();
        resolve();
      });
    });
  }

  /**
   * MapLibre's compact attribution starts expanded; fold it to the (i)
   * button so it does not sit on the toolbar. The full credit is one click
   * away, as the OpenStreetMap and OpenMapTiles licences require.
   */
  private collapseAttribution(): void {
    const el = this.map.getContainer().querySelector(".maplibregl-ctrl-attrib");
    if (!el) return;
    el.classList.remove("maplibregl-compact-show");
    el.removeAttribute("open");
  }

  private indexStyleLayers(): void {
    const layers = this.map.getStyle().layers ?? [];
    const detailSources = new Set(["transportation", "building", "aeroway", "landuse", "park"]);
    for (const l of layers) {
      this.styleLayers.push({
        id: l.id,
        type: l.type,
        sourceLayer: "source-layer" in l ? (l["source-layer"] ?? "") : "",
      });
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
          0,
          "#ffe082",
          0.35,
          "#ffa726",
          0.7,
          "#f4511e",
          1,
          "#b71c1c",
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
    this.theme = t;
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
    this.applyPaintRamp(t);
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
    this.map.setFilter("water", on ? (base ?? null) : combined);
  }

  setBorders(on: boolean): void {
    for (const id of this.borderLayers) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map.getSource(id);
  }

  setPaint(data: GeoJSON.FeatureCollection): void {
    void this.source(PAINT_SOURCE)?.setData(data);
  }

  /**
   * Colour the paint layer with a single hue (a player's colour) instead of
   * the theme ramp. Pass null to restore the ramp.
   */
  setPaintColour(colour: string | null): void {
    if (!this.map.getLayer("paint-fill")) return;
    if (colour === null) {
      if (this.theme) this.applyPaintRamp(this.theme);
      return;
    }
    this.map.setPaintProperty("paint-fill", "fill-color", colour);
    this.map.setPaintProperty("paint-fill", "fill-opacity", ["interpolate", ["linear"], ["get", "v"], 0, 0.12, 1, 0.9]);
  }

  /** Colour each feature by its own `colour` property, for several players at once. */
  setPaintColourPerFeature(): void {
    if (!this.map.getLayer("paint-fill")) return;
    this.map.setPaintProperty("paint-fill", "fill-color", ["coalesce", ["get", "colour"], "#888888"]);
    this.map.setPaintProperty("paint-fill", "fill-opacity", ["interpolate", ["linear"], ["get", "v"], 0, 0.12, 1, 0.9]);
  }

  private applyPaintRamp(t: Theme): void {
    if (!this.map.getLayer("paint-fill")) return;
    this.map.setPaintProperty("paint-fill", "fill-color", [
      "interpolate",
      ["linear"],
      ["get", "v"],
      0,
      t.ramp[0],
      1 / 3,
      t.ramp[1],
      2 / 3,
      t.ramp[2],
      1,
      t.ramp[3],
    ]);
    this.map.setPaintProperty("paint-fill", "fill-opacity", [
      "interpolate",
      ["linear"],
      ["get", "v"],
      0,
      t.rampOpacity[0],
      1,
      t.rampOpacity[1],
    ]);
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
    void this.source(REVEAL_SOURCE)?.setData(fc);
  }

  clearReveal(): void {
    void this.source(REVEAL_SOURCE)?.setData({
      type: "FeatureCollection",
      features: [],
    });
  }

  metersPerPixel(lat: number): number {
    const z = this.map.getZoom();
    return (WORLD_M * Math.cos((lat * Math.PI) / 180)) / (WORLD_PX_Z0 * Math.pow(2, z));
  }

  /** Back to the whole-world starting view, e.g. at the start of a round. */
  resetView(): void {
    void this.map.easeTo({ center: WORLD_CENTER, zoom: WORLD_ZOOM, duration: 700 });
  }

  /** Fit the answer and a paint layer's cells into view, with a sensible zoom cap. */
  fitAnswerAndPaint(answer: LatLon, paint: GeoJSON.FeatureCollection, toleranceKm: number): void {
    let minLon = answer.lon,
      maxLon = answer.lon,
      minLat = answer.lat,
      maxLat = answer.lat;
    for (const f of paint.features) {
      if (f.geometry.type !== "Polygon") continue;
      for (const [lon, lat] of f.geometry.coordinates[0] as [number, number][]) {
        // Cells that were unwrapped past 180 are folded back for the bbox.
        const l = lon > 180 ? lon - 360 : lon;
        if (l < minLon) minLon = l;
        if (l > maxLon) maxLon = l;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    // Always include at least two tolerances around the answer.
    const dLat = (2 * toleranceKm) / 111;
    const dLon = dLat / Math.max(0.2, Math.cos((answer.lat * Math.PI) / 180));
    minLat = Math.min(minLat, answer.lat - dLat);
    maxLat = Math.max(maxLat, answer.lat + dLat);
    minLon = Math.min(minLon, answer.lon - dLon);
    maxLon = Math.max(maxLon, answer.lon + dLon);
    if (maxLon - minLon > 300) {
      // Spans most of the world; just show it all.
      void this.map.easeTo({ center: [answer.lon, 20], zoom: this.map.getMinZoom(), duration: 900 });
      return;
    }
    void this.map.fitBounds(
      [
        [minLon, Math.max(-85, minLat)],
        [maxLon, Math.min(85, maxLat)],
      ],
      // Keep clear of the HUD cards on the left and right and the toolbar below.
      { padding: { top: 40, bottom: 90, left: 340, right: 340 }, duration: 900, maxZoom: 10 },
    );
  }

  /** Ease so that about eight tolerances span 40% of the viewport width. */
  focusOn(answer: LatLon, toleranceKm: number): void {
    const widthPx = this.map.getContainer().clientWidth;
    const cos = Math.max(0.05, Math.cos((answer.lat * Math.PI) / 180));
    const targetMpp = (toleranceKm * 8 * 1000) / (0.4 * widthPx);
    const zoom = Math.log2((WORLD_M * cos) / (WORLD_PX_Z0 * targetMpp));
    void this.map.easeTo({
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
    const lon2 =
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
