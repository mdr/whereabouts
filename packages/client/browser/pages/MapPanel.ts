import type { CDPSession, Page } from "playwright-core";
import type {} from "../../src/ui/MapView.tsx";
import { mapViewTestIds } from "../../src/ui/MapViewTestIds.ts";
import { hudBottomTestIds, questionCardTestIds } from "../../src/ui/bitsTestIds.ts";
import { playersPanelTestIds } from "../../src/ui/PlayersPanelTestIds.ts";
import { isUsable, until } from "./support.ts";

/** A spot on the map, as fractions of its width and height from the top left. */
export interface MapSpot {
  across: number;
  down: number;
}

/**
 * The map that fills the game screens. MapLibre draws onto a canvas, so
 * spots are given as fractions of the map, and paint is read from the app's
 * debugging handle on `window.whereabouts`.
 */
export class MapPanel {
  readonly #page: Page;
  #cdp: CDPSession | null = null;

  constructor(page: Page) {
    this.#page = page;
  }

  /** Waits until the map has loaded and stopped moving. */
  async waitUntilSettled(timeoutMs = 30_000): Promise<void> {
    await this.#page.getByTestId(mapViewTestIds.map).locator("canvas").waitFor({ timeout: timeoutMs });
    await this.#page.getByTestId(mapViewTestIds.loading).waitFor({ state: "detached", timeout: timeoutMs });
    // Still for half a second: a new round flies the view to its start.
    let stillSince = Date.now();
    await until(
      "the map to settle",
      async () => {
        const still = await this.#page.evaluate(() => {
          const m = window.whereabouts.map;
          return m.loaded() && !m.isMoving();
        });
        if (!still) stillSince = Date.now();
        return Date.now() - stillSince;
      },
      (ms) => ms >= 500,
      timeoutMs,
    );
  }

  async #point({ across, down }: MapSpot): Promise<{ x: number; y: number }> {
    const box = await this.#page.getByTestId(mapViewTestIds.map).boundingBox();
    if (!box) throw new Error("the map is not on screen");
    return { x: box.x + box.width * across, y: box.y + box.height * down };
  }

  /** Drag the mouse a short way to the right from `at`, with the button held. */
  async drag(at: MapSpot, { distancePx = 40, steps = 8, holdMs = 0 } = {}): Promise<void> {
    const { x, y } = await this.#point(at);
    const mouse = this.#page.mouse;
    await mouse.move(x, y);
    await mouse.down();
    for (let i = 1; i <= steps; i++) {
      await mouse.move(x + (distancePx * i) / steps, y + Math.sin(i) * 4);
      if (holdMs) await this.#page.waitForTimeout(holdMs / steps);
    }
    await mouse.up();
  }

  /** A click without moving. */
  async dab(at: MapSpot): Promise<void> {
    await this.drag(at, { distancePx: 10, steps: 1 });
  }

  /** The middle of the strip of map between the cards at the top and the toolbar. */
  async spotClearOfCards(): Promise<MapSpot> {
    const bottomOf = async (id: string) => {
      const b = await this.#page.getByTestId(id).boundingBox();
      return b ? b.y + b.height : 0;
    };
    const top = Math.max(await bottomOf(questionCardTestIds.card), await bottomOf(playersPanelTestIds.toggle));
    const toolbar = await this.#page.getByTestId(hudBottomTestIds.toolbar).boundingBox();
    const map = await this.#page.getByTestId(mapViewTestIds.map).boundingBox();
    if (!toolbar || !map) throw new Error("the map or toolbar is not on screen");
    return { across: 0.5, down: ((top + toolbar.y) / 2 - map.y) / map.height };
  }

  async hover(at: MapSpot): Promise<void> {
    const { x, y } = await this.#point(at);
    await this.#page.mouse.move(x, y);
  }

  async #touch(type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]): Promise<void> {
    this.#cdp ??= await this.#page.context().newCDPSession(this.#page);
    await this.#cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(({ x, y }, id) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })),
    });
  }

  /** One finger dragged a short way to the right from `at`. */
  async fingerDrag(at: MapSpot): Promise<void> {
    const { x, y } = await this.#point(at);
    await this.#touch("touchStart", [{ x, y }]);
    for (let i = 1; i <= 8; i++) {
      await this.#touch("touchMove", [{ x: x + i * 8, y: y + i * 4 }]);
      await this.#page.waitForTimeout(30);
    }
    await this.#touch("touchEnd", []);
  }

  /** Two fingers either side of `at`, spread apart. */
  async pinchOut(at: MapSpot): Promise<void> {
    const { x, y } = await this.#point(at);
    await this.#touch("touchStart", [{ x: x - 50, y }]);
    await this.#page.waitForTimeout(30);
    await this.#touch("touchStart", [
      { x: x - 50, y },
      { x: x + 50, y },
    ]);
    for (let i = 1; i <= 6; i++) {
      await this.#touch("touchMove", [
        { x: x - 50 - i * 8, y },
        { x: x + 50 + i * 8, y },
      ]);
      await this.#page.waitForTimeout(30);
    }
    await this.#touch("touchEnd", []);
  }

  /** Cells in your own paint this round. */
  async yourPaintCells(): Promise<number> {
    return this.#page.evaluate(() => window.whereabouts.paint.layer.size);
  }

  /** Cells of paint drawn on the map: yours while guessing, whoever's is chosen at the reveal. */
  async shownPaintCells(): Promise<number> {
    return this.#page.evaluate(() => {
      const source = window.whereabouts.map.getSource("paint") as unknown as
        { serialize: () => { data: GeoJSON.FeatureCollection } } | undefined;
      return source?.serialize().data.features.length ?? 0;
    });
  }

  /** Starts counting requests for terrain tiles (the shaded relief, which gives mountains away). */
  countTerrainTileRequests(): { count: () => number } {
    let n = 0;
    this.#page.on("request", (r) => {
      if (r.url().includes("elevation-tiles-prod")) n++;
    });
    return { count: () => n };
  }

  async attributionIsUsable(): Promise<boolean> {
    return isUsable(this.#page.locator(".maplibregl-ctrl-attrib-button"));
  }

  /** On a phone the toolbar spans the screen, so the attribution button has to sit above it. */
  async attributionClearsToolbar(): Promise<boolean> {
    const attribution = await this.#page.locator(".maplibregl-ctrl-bottom-right").boundingBox();
    const toolbar = await this.#page.getByTestId(hudBottomTestIds.toolbar).boundingBox();
    return attribution !== null && toolbar !== null && attribution.y + attribution.height <= toolbar.y + 1;
  }
}
