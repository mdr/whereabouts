import { PageObject } from "../steps.ts"
import type { Page } from "@playwright/test"
import type { Ms } from "@whereabouts/shared/units"
import { allFlagsTestIds } from "../../../src/ui/round/flag-reveal/AllFlags/AllFlagsTestIds.ts"
import type { Hand } from "../../../src/vr/hands/hand.ts"
import type { SprayTool } from "../../../src/vr/spray/spray-rules.ts"
import { expectNumber, expectPolled, stillTrueFor, type Bounds, type PollOptions } from "../support.ts"
import { expectProbe, expectProbeNumber, probe } from "./probe.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

/** What the headset's scene shows apart from its panels: the globe, flags, paint, tools, beams, moon and space. */
export class HeadsetScene extends PageObject {
  readonly #page: Page

  constructor(page: Page) {
    super()
    this.#page = page
  }

  /** Cells of paint drawn on the VR globe. */
  globePaintCells(): Promise<number> {
    return probe(this.#page, "shownPaintCells")
  }

  async expectGlobePaintCells(bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectProbeNumber(this.#page, "shownPaintCells", "cells of paint drawn on the VR globe", bounds, options)
  }

  async expectGlobeDetail(shown: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "detailShown",
      shown ? "zooming in brings the map over the globe" : "no map shows over the globe",
      String(shown),
      (on) => on === shown,
      options
    )
  }

  /** No map shows over the globe for `duration`. */
  async expectNoGlobeDetailFor(duration: Ms = 500): Promise<void> {
    await stillTrueFor(
      "no map over the globe",
      duration,
      () => probe(this.#page, "detailShown"),
      (on) => !on
    )
  }

  async expectGlobeColour(shown: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "colourShown",
      shown ? "the globe shows the land in natural colour" : "the globe shows the plain land",
      String(shown),
      (on) => on === shown,
      options
    )
  }

  async expectGlobeBorders(shown: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "bordersShown",
      shown ? "the globe shows national borders" : "the globe shows no borders",
      String(shown),
      (on) => on === shown,
      options
    )
  }

  /** The globe shows no borders for `duration`. */
  async expectNoGlobeBordersFor(duration: Ms = 500): Promise<void> {
    await stillTrueFor(
      "no borders on the globe",
      duration,
      () => probe(this.#page, "bordersShown"),
      (on) => !on
    )
  }

  /** Droplets and crumbs in the air. */
  async expectParticles(bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectProbeNumber(this.#page, "particlesLive", "droplets in the air", bounds, options)
  }

  /** The narrowest gap, in radians as the player sees it, between a panel and the globe: negative if one overlaps it. */
  async expectPanelGap(bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectProbeNumber(
      this.#page,
      "panelGap",
      "the gap in radians between the panels and the globe",
      bounds,
      options
    )
  }

  async expectFlagPins(bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectProbeNumber(this.#page, "flagPinsShown", "flags pinned on the globe", bounds, options)
  }

  async expectFlagPinsOnPage(bounds: Bounds): Promise<void> {
    await expectNumber(
      "flags pinned on the page's map",
      () => this.#page.getByTestId(allFlagsTestIds.pin).count(),
      bounds
    )
  }

  /** The country whose flag the player points at. */
  async expectFlagNamed(name: string, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "flagNamed",
      "pointing at a flag names its country",
      name,
      (named) => named === name,
      options
    )
  }

  /** The country's border is picked out on the globe, in at least `segments` line segments. */
  async expectFlagOutlined(name: string, segments: number, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "flagOutlined",
      `the border of ${name} is picked out in at least ${segments} segments`,
      `${name}, ${segments}+ segments`,
      (outlined) => outlined?.name === name && outlined.segments >= segments,
      options
    )
  }

  /** The flag nearest the eyes with a border to outline, and where its middle is. */
  flagFacing(): Promise<{ name: string; at: Vec3 } | undefined> {
    return probe(this.#page, "flagFacing")
  }

  /** How much paint the round has: every cell's intensity, summed. */
  paintMass(): Promise<number> {
    return probe(this.#page, "paintMass")
  }

  async expectPaintMass(bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectProbeNumber(this.#page, "paintMass", "the paint on the VR globe, in all", bounds, options)
  }

  /** The paint mass stays `mass` for `duration`. */
  async expectPaintMassStays(mass: number, duration: Ms): Promise<void> {
    await stillTrueFor(
      "the paint on the globe",
      duration,
      () => probe(this.#page, "paintMass"),
      (now) => now === mass
    )
  }

  /** The hands hold the can and eraser, or put them away. */
  async expectToolsHeld(held: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "toolsHeld",
      held ? "the hands hold the can and eraser" : "the hands put the can and eraser away",
      String(held),
      (now) => now === held,
      options
    )
  }

  /** The controllers themselves show, rather than the can and eraser. */
  async expectControllersShown(shown: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "controllersShown",
      shown ? "the controllers show" : "the controllers are hidden",
      String(shown),
      (now) => now === shown,
      options
    )
  }

  /** Rays from the hands show what they point at. */
  async expectBeamsShown(shown: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "beamsShown",
      shown ? "rays from the hands show" : "no rays show from the hands",
      String(shown),
      (now) => now === shown,
      options
    )
  }

  /** The moon's distance from the globe and its radius, in globe radii, to within `within`. */
  async expectMoon(
    expected: { distance: number; radius: number },
    within: { distance: number; radius: number },
    options: PollOptions = {}
  ): Promise<void> {
    await expectProbe(
      this.#page,
      "moonShown",
      "the moon shows, to the globe's scale",
      `distance ${expected.distance} and radius ${expected.radius} of the globe's`,
      (moon) =>
        moon !== undefined &&
        Math.abs(moon.distance - expected.distance) < within.distance &&
        Math.abs(moon.radius - expected.radius) < within.radius,
      options
    )
  }

  async expectNoMoon(options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "moonShown",
      "the moon goes with space",
      "no moon",
      (moon) => moon === undefined,
      options
    )
  }

  /** How many times its smallest size the globe is. */
  async expectGlobeScale(bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectProbeNumber(this.#page, "globeScale", "how many times its smallest size the globe is", bounds, options)
  }

  /** What a hand holds: paint, erase or fill. */
  async expectToolInHand(hand: Hand, tool: SprayTool, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "toolInHand",
      `the ${hand} hand holds the ${tool} tool`,
      tool,
      (tools) => tools[hand] === tool,
      options
    )
  }

  /** Space shows round the globe, not the room. */
  async expectSpaceShown(options: PollOptions = {}): Promise<void> {
    await this.#expectSurroundings(true, "space shows round the globe", options)
  }

  /** The room shows round the globe, not space. */
  async expectPassthroughShown(options: PollOptions = {}): Promise<void> {
    await this.#expectSurroundings(false, "See your room swaps space for passthrough", options)
  }

  async #expectSurroundings(space: boolean, message: string, options: PollOptions): Promise<void> {
    await expectPolled(
      message,
      space ? "space, no passthrough" : "passthrough, no space",
      () =>
        this.#page.evaluate(() => ({
          space: window.testHooks.vr!.probe.spaceShown,
          passthrough: window.testHooks.vr!.probe.passthrough
        })),
      (now) => now.space === space && now.passthrough === !space,
      { timeout: 10_000, ...options }
    )
  }

  /** The globe shades a hint's band, or does not. */
  async expectHintShown(shown: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "hintShown",
      shown ? "the globe shades the hint's band" : "the globe shades no hint band",
      String(shown),
      (now) => now === shown,
      options
    )
  }

  /** Where a hand's tool would land on the globe, if it points at it. */
  async target(hand: Hand): Promise<Vec3 | undefined> {
    return this.#page.evaluate((side) => window.testHooks.vr!.probe.targetOf(side), hand)
  }
}
