import { expect, type CDPSession, type Page } from "@playwright/test"
import type {} from "../../../src/test-hooks.ts"
import { mapViewTestIds } from "../../../src/ui/map/MapView/MapViewTestIds.ts"
import { hudBottomTestIds } from "../../../src/ui/map/Hud/HudTestIds.ts"
import { questionCardTestIds } from "../../../src/ui/round/question/QuestionCard/QuestionCardTestIds.ts"
import { playersPanelTestIds } from "../../../src/ui/players/PlayersPanel/PlayersPanelTestIds.ts"
import {
  expectNumber,
  expectPolled,
  expectUsable,
  paceGesture,
  softExpect,
  stillTrueFor,
  type Bounds
} from "../support.ts"
import type { Ms, Px } from "@whereabouts/shared/units"

/** A spot on the map, as fractions of its width and height from the top left. */
export interface MapSpot {
  across: number
  down: number
}

/**
 * The map that fills the game screens. MapLibre draws onto a canvas, so
 * spots are given as fractions of the map, and paint is read from the app's
 * debugging handle on `window.testHooks.map`.
 */
export class MapPanel {
  readonly #page: Page
  #cdp: CDPSession | undefined = undefined

  constructor(page: Page) {
    this.#page = page
  }

  /** Waits until the map has loaded and stopped moving. */
  async waitUntilSettled(timeout: Ms = 30_000): Promise<void> {
    await this.#page.getByTestId(mapViewTestIds.map).locator("canvas").waitFor({ timeout })
    await this.#page.getByTestId(mapViewTestIds.loading).waitFor({ state: "detached", timeout })
    // Still for half a second: a new round flies the view to its start.
    let stillSince = Date.now()
    await expect
      .poll(
        async () => {
          const still = await this.#page.evaluate(() => {
            const m = window.testHooks.map!.map
            return m.loaded() && !m.isMoving()
          })
          if (!still) stillSince = Date.now()
          return Date.now() - stillSince
        },
        { message: "the map loads and stops moving", timeout, intervals: [100] }
      )
      .toBeGreaterThanOrEqual(500)
  }

  async #point({ across, down }: MapSpot): Promise<{ x: Px; y: Px }> {
    const box = await this.#page.getByTestId(mapViewTestIds.map).boundingBox()
    if (!box) throw new Error("the map is not on screen")
    return { x: box.x + box.width * across, y: box.y + box.height * down }
  }

  /** Drag the mouse a short way to the right from `at`, with the button held. */
  async drag(
    at: MapSpot,
    { distance = 40, steps = 8, hold = 0 }: { distance?: Px; steps?: number; hold?: Ms } = {}
  ): Promise<void> {
    const { x, y } = await this.#point(at)
    const mouse = this.#page.mouse
    await mouse.move(x, y)
    await mouse.down()
    for (let i = 1; i <= steps; i++) {
      await mouse.move(x + (distance * i) / steps, y + Math.sin(i) * 4)
      if (hold) await paceGesture(this.#page, hold / steps)
    }
    await mouse.up()
  }

  /** Drag with Space held, which pans whatever the tool. */
  async dragHoldingSpace(at: MapSpot): Promise<void> {
    await this.#page.keyboard.down("Space")
    await this.drag(at, { distance: 120, steps: 12 })
    await this.#page.keyboard.up("Space")
  }

  /** A click without moving. */
  async dab(at: MapSpot): Promise<void> {
    await this.drag(at, { distance: 10, steps: 1 })
  }

  /** The middle of the strip of map between the cards at the top and the toolbar. */
  async spotClearOfCards(): Promise<MapSpot> {
    const bottomOf = async (id: string) => {
      const b = await this.#page.getByTestId(id).boundingBox()
      return b ? b.y + b.height : 0
    }
    const top = Math.max(await bottomOf(questionCardTestIds.card), await bottomOf(playersPanelTestIds.toggle))
    const toolbar = await this.#page.getByTestId(hudBottomTestIds.toolbar).boundingBox()
    const map = await this.#page.getByTestId(mapViewTestIds.map).boundingBox()
    if (!toolbar || !map) throw new Error("the map or toolbar is not on screen")
    return { across: 0.5, down: ((top + toolbar.y) / 2 - map.y) / map.height }
  }

  async hover(at: MapSpot): Promise<void> {
    const { x, y } = await this.#point(at)
    await this.#page.mouse.move(x, y)
  }

  async #touch(type: "touchStart" | "touchMove" | "touchEnd", points: { x: Px; y: Px }[]): Promise<void> {
    this.#cdp ??= await this.#page.context().newCDPSession(this.#page)
    await this.#cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(({ x, y }, id) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 }))
    })
  }

  /** One finger dragged a short way to the right from `at`. */
  async fingerDrag(at: MapSpot): Promise<void> {
    const { x, y } = await this.#point(at)
    await this.#touch("touchStart", [{ x, y }])
    for (let i = 1; i <= 8; i++) {
      await this.#touch("touchMove", [{ x: x + i * 8, y: y + i * 4 }])
      await paceGesture(this.#page, 30)
    }
    await this.#touch("touchEnd", [])
  }

  /** Two fingers either side of `at`, spread apart. */
  async pinchOut(at: MapSpot): Promise<void> {
    const { x, y } = await this.#point(at)
    await this.#touch("touchStart", [{ x: x - 50, y }])
    await paceGesture(this.#page, 30)
    await this.#touch("touchStart", [
      { x: x - 50, y },
      { x: x + 50, y }
    ])
    for (let i = 1; i <= 6; i++) {
      await this.#touch("touchMove", [
        { x: x - 50 - i * 8, y },
        { x: x + 50 + i * 8, y }
      ])
      await paceGesture(this.#page, 30)
    }
    await this.#touch("touchEnd", [])
  }

  /** The button by the zoom buttons that switches between the flat map and the globe. */
  async toggleGlobe(): Promise<void> {
    await this.#page.getByTestId(mapViewTestIds.globeButton).click()
    await this.waitUntilSettled()
  }

  /** The share of the answer (its marker, or a country's outline) on screen between `top` and `bottom`. */
  async answerShareBetween(top: Px, bottom: Px): Promise<number> {
    return this.#page.evaluate(
      async ({ top, bottom }) => {
        const { map } = window.testHooks.map!
        const source = map.getSource("reveal") as unknown as { getData(): Promise<GeoJSON.FeatureCollection> }
        const points: GeoJSON.Position[] = []
        for (const { geometry: g } of (await source.getData()).features) {
          if (g.type === "Point") points.push(g.coordinates)
          if (g.type === "MultiPolygon") for (const polygon of g.coordinates) points.push(...polygon[0]!)
        }
        const inside = points
          .map(([lon, lat]) => map.project([lon!, lat!]))
          .filter((point) => point.x >= 0 && point.x <= innerWidth && point.y >= top - 2 && point.y <= bottom + 2)
        return points.length === 0 ? 0 : inside.length / points.length
      },
      { top, bottom }
    )
  }

  async expectGlobe(shown: boolean): Promise<void> {
    await expect
      .poll(() => this.#page.evaluate(() => window.testHooks.map!.map.getProjection().type === "globe"), {
        message: shown ? "the map shows the globe" : "the map shows the flat map"
      })
      .toBe(shown)
  }

  /** Cells in your own paint this round. */
  async yourPaintCells(): Promise<number> {
    return this.#page.evaluate(() => window.testHooks.map!.paint.layer.size)
  }

  async expectYourPaintCells(bounds: Bounds): Promise<void> {
    await expectNumber("cells of your own paint", () => this.yourPaintCells(), bounds)
  }

  /** Your paint now lies somewhere else: little of it is in `previousCellIds`. */
  async expectPaintMovedFrom(previousCellIds: string[]): Promise<void> {
    const previous = new Set(previousCellIds)
    await expectPolled(
      "your paint lies elsewhere than before",
      "some paint, less than a fifth of it in the old cells",
      () => this.yourPaintCellIds(),
      (cells) => cells.length > 0 && cells.filter((cell) => previous.has(cell)).length < cells.length / 5
    )
  }

  /** How much paint you have: intensity times area, in km². */
  async yourPaintMass(): Promise<number> {
    return this.#page.evaluate(() => window.testHooks.map!.paint.layer.mass())
  }

  async expectYourPaintMass(bounds: Bounds): Promise<void> {
    await expectNumber("the mass of your own paint, in km²", () => this.yourPaintMass(), bounds)
  }

  /** Which cells your paint is in. */
  async yourPaintCellIds(): Promise<string[]> {
    return this.#page.evaluate(() => [...window.testHooks.map!.paint.layer.cells.keys()])
  }

  /** Paint uploads so far: tried, and of those, sent over a live connection. */
  async paintUploads(): Promise<{ attempted: number; sent: number }> {
    return this.#page.evaluate(() => ({ ...window.testHooks.paintUploads }))
  }

  /** Until more paint uploads than `after` have been `kind`. */
  async waitForPaintUpload(kind: "attempted" | "sent", after: number): Promise<void> {
    await expectNumber(
      `a paint upload is ${kind}`,
      async () => (await this.paintUploads())[kind],
      { greaterThan: after },
      { timeout: 10_000 }
    )
  }

  /** Runs `action` (a stroke, say) and waits for the paint upload it brings. */
  async untilUploaded(action: () => Promise<void>, kind: "attempted" | "sent" = "sent"): Promise<void> {
    const before = (await this.paintUploads())[kind]
    await action()
    await this.waitForPaintUpload(kind, before)
  }

  /** Cells of paint drawn on the map: yours while guessing, whoever's is chosen at the reveal. */
  async shownPaintCells(): Promise<number> {
    return this.#page.evaluate(() => {
      const source = window.testHooks.map!.map.getSource("paint") as unknown as
        | { serialize: () => { data: GeoJSON.FeatureCollection } }
        | undefined
      return source?.serialize().data.features.length ?? 0
    })
  }

  async expectShownPaintCells(bounds: Bounds): Promise<void> {
    await expectNumber("cells of paint drawn on the map", () => this.shownPaintCells(), bounds)
  }

  async #shownHintShapes(): Promise<number> {
    return this.#page.evaluate(() => {
      const source = window.testHooks.map!.map.getSource("hint") as unknown as
        | { serialize: () => { data: GeoJSON.FeatureCollection } }
        | undefined
      return source?.serialize().data.features.length ?? 0
    })
  }

  /** Shapes in the hint band shaded on the map: 1, or 2 for a longitude band across 180°. */
  async expectHintShapes(bounds: Bounds): Promise<void> {
    await expectNumber("shapes in the hint band shaded on the map", () => this.#shownHintShapes(), bounds)
  }

  /** No hint band stays shaded for `duration`. */
  async expectNoHintShapes(duration = 500): Promise<void> {
    await stillTrueFor(
      "the map having no hint band shaded",
      duration,
      () => this.#shownHintShapes(),
      (shapes) => shapes === 0
    )
  }

  async expectAttributionUsable(): Promise<void> {
    await expectUsable(
      this.#page.locator(".maplibregl-ctrl-attrib-button"),
      "the map attribution button is on screen and uncovered"
    )
  }

  /** On a phone the toolbar spans the screen, so the attribution button has to sit above it. */
  async expectAttributionClearsToolbar(): Promise<void> {
    await expectPolled(
      "the attribution button sits above the toolbar",
      "above the toolbar",
      async () => {
        const attribution = (await this.#page.locator(".maplibregl-ctrl-bottom-right").boundingBox()) ?? undefined
        const toolbar = (await this.#page.getByTestId(hudBottomTestIds.toolbar).boundingBox()) ?? undefined
        return { attribution, toolbar }
      },
      ({ attribution, toolbar }) =>
        attribution !== undefined && toolbar !== undefined && attribution.y + attribution.height <= toolbar.y + 1,
      { expector: softExpect }
    )
  }
}
