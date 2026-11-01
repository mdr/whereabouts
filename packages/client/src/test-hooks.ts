import type { Vr } from "./vr"
import type { GameMap } from "./map/map"
import type { PaintController } from "./paint/paint-controller"

/** What the browser tests reach into the page for. Each part is present only while its owner is alive. */
interface TestHooks {
  map?: { map: GameMap["map"]; gameMap: GameMap; paint: PaintController }
  vr?: Vr
}

declare global {
  interface Window {
    testHooks: TestHooks
  }
}

window.testHooks = {}
