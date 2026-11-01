import type { Page } from "@playwright/test"
import type { Hand } from "../../../src/vr/hands/hand.ts"
import { probe } from "./probe.ts"

/** What the headset's scene shows apart from its panels: the globe, flags, paint, tools, beams, moon and space. */
export class HeadsetScene {
  readonly #page: Page

  constructor(page: Page) {
    this.#page = page
  }

  /** Cells of paint drawn on the VR globe. */
  globePaintCells() {
    return probe(this.#page, "shownPaintCells")
  }

  /** Whether the page's map shows over the zoomed-in globe. */
  globeDetailShown() {
    return probe(this.#page, "detailShown")
  }

  /** Whether the globe's land shows in natural colour. */
  globeColourShown() {
    return probe(this.#page, "colourShown")
  }

  /** Whether national borders show on the globe. */
  globeBordersShown() {
    return probe(this.#page, "bordersShown")
  }

  /** Droplets and crumbs in the air. */
  particles() {
    return probe(this.#page, "particlesLive")
  }

  /** The narrowest gap, in radians as the player sees it, between a panel and the globe: negative if one overlaps it. */
  panelGap() {
    return probe(this.#page, "panelGap")
  }

  /** How many countries' flags are pinned on the globe. */
  flagPins() {
    return probe(this.#page, "flagPinsShown")
  }

  /** The country whose flag the player points at, if any. */
  flagNamed() {
    return probe(this.#page, "flagNamed")
  }

  /** The country whose border is picked out on the globe, and in how many line segments. */
  flagOutlined() {
    return probe(this.#page, "flagOutlined")
  }

  /** The flag nearest the eyes with a border to outline, and where its middle is. */
  flagFacing() {
    return probe(this.#page, "flagFacing")
  }

  /** How much paint the round has: every cell's intensity, summed. */
  paintMass() {
    return probe(this.#page, "paintMass")
  }

  /** Whether the controllers themselves show, rather than the can and eraser. */
  controllersShown() {
    return probe(this.#page, "controllersShown")
  }

  /** Whether a pointing ray shows from either hand. */
  beamsShown() {
    return probe(this.#page, "beamsShown")
  }

  /** The moon's distance from the globe and its radius, in globe radii, if it shows. */
  moon() {
    return probe(this.#page, "moonShown")
  }

  /** How many times its smallest size the globe is. */
  globeScale() {
    return probe(this.#page, "globeScale")
  }

  /** Whether either hand holds its can or eraser. */
  toolsHeld() {
    return probe(this.#page, "toolsHeld")
  }

  /** What each hand holds: paint, erase or fill. */
  toolInHand() {
    return probe(this.#page, "toolInHand")
  }

  /** Whether space shows round the player, and whether the room should instead. */
  async surroundings(): Promise<{ space: boolean; passthrough: boolean }> {
    return this.#page.evaluate(() => ({
      space: window.testHooks.vr!.probe.spaceShown,
      passthrough: window.testHooks.vr!.probe.passthrough
    }))
  }

  /** Whether the globe shades a hint's band. */
  hintShown() {
    return probe(this.#page, "hintShown")
  }

  /** Where a hand's tool would land on the globe, if it points at it. */
  async target(hand: Hand) {
    return this.#page.evaluate((side) => window.testHooks.vr!.probe.targetOf(side), hand)
  }
}
