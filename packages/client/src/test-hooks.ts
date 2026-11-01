import type { Map as MapLibreMap } from "maplibre-gl"
import type { Vr } from "./vr"
import type { GameMap } from "./map/map"
import type { PaintController } from "./paint/paint-controller"

/** What the browser tests reach into the page for. Parts that belong to something that comes and goes are present only while it is alive. */
interface TestHooks {
  map?: { map: MapLibreMap; gameMap: GameMap; paint: PaintController }
  vr?: Vr
  /** The game connection, while a multiplayer screen is mounted. */
  connection?: { connected: () => boolean }
  /** Paint uploads over the page's life: tried, and of those, sent over a live connection. */
  paintUploads: { attempted: number; sent: number }
}

declare global {
  interface Window {
    testHooks: TestHooks
  }
}

window.testHooks = { paintUploads: { attempted: 0, sent: 0 } }
