/** What the browser tests read of the headset's scene, as `window.whereaboutsVr.probe`. */
import { Vector3, type World } from "@iwsdk/core"
import { headsetPassthrough } from "../settings"
import type { VrBoard, ResultsBoard } from "./board"
import type { PanelClearance } from "./clearance"
import type { DetailPatch } from "./detail-patch"
import type { FlagPins } from "./flag-pins"
import type { Globe, Hand } from "./globe"
import type { HintMarker } from "./hint"
import type { Menu, MenuShown } from "./menu"
import type { Moon } from "./moon"
import type { Picture } from "./picture"
import type { ScoreBoard, VrTable } from "./scores"
import type { Space } from "./space"
import type { HandTool } from "./spray"
import type { VrView } from "./view"
import type { WristButton, WristMenu } from "./wrist"

const HANDS = ["left", "right"] as const

export interface ProbedParts {
  world: World
  view(): VrView | undefined
  globe: Globe
  detail: DetailPatch
  picture: Picture
  hint: HintMarker
  wrist: WristMenu
  scores: ScoreBoard
  board: ResultsBoard
  flagPins: FlagPins
  space: Space
  moon: Moon
  menu: Menu
  clearance: PanelClearance
  tools: Record<Hand, HandTool>
}

export class VrProbe {
  private readonly vr: ProbedParts

  constructor(parts: ProbedParts) {
    this.vr = parts
  }

  /** Times the scene has been drawn. */
  get drawn(): number {
    return this.vr.world.renderer.info.render.frame
  }

  /** The reveal's line of interest. */
  get factShown(): string | undefined {
    const view = this.vr.view()
    return view?.kind === "reveal" ? view.reveal.fact : undefined
  }

  get viewKind(): VrView["kind"] | undefined {
    return this.vr.view()?.kind
  }

  get tableShown(): VrTable | undefined {
    return this.vr.scores.shown
  }

  /** Droplets and crumbs in the air. */
  get particlesLive(): number {
    return this.vr.tools.left.particlesLive + this.vr.tools.right.particlesLive
  }

  /** The narrowest gap, in radians as the player sees it, between a panel and the globe. */
  get panelGap(): number {
    return this.vr.clearance.gap(this.vr.globe)
  }

  get flagPinsShown(): number {
    return this.vr.flagPins.shown
  }

  /** The country whose flag is pointed at. */
  get flagNamed(): string | undefined {
    return this.vr.flagPins.named
  }

  /** The country whose border is picked out, and in how many line segments. */
  get flagOutlined(): { name: string; segments: number } | undefined {
    return this.vr.flagPins.outlined
  }

  /** The flag nearest the eyes with a border to outline, and where. */
  get flagFacing(): { name: string; at: [number, number, number] } | undefined {
    const f = this.vr.flagPins.nearest(this.vr.world.player.head.getWorldPosition(new Vector3()))
    return f && { name: f.name, at: [f.at.x, f.at.y, f.at.z] }
  }

  /** How much paint the round has, all cells' intensities summed. */
  get paintMass(): number {
    const view = this.vr.view()
    return view && "round" in view ? view.round.paint.layer.mass() : 0
  }

  /** Whether the globe is turning to show a place. */
  get globeTurning(): boolean {
    return this.vr.globe.busy
  }

  get globeScale(): number {
    return this.vr.globe.scale
  }

  get toolsHeld(): boolean {
    return this.vr.tools.left.held || this.vr.tools.right.held
  }

  get spaceShown(): boolean {
    return this.vr.space.group.visible
  }

  get passthrough(): boolean {
    return headsetPassthrough.value
  }

  get boardShown(): VrBoard | undefined {
    return this.vr.board.mesh.visible ? this.vr.board.shown : undefined
  }

  /** Whether the land shows in natural colour. */
  get colourShown(): boolean {
    return this.vr.globe.colourShown
  }

  get bordersShown(): boolean {
    return this.vr.globe.bordersShown
  }

  get menuShown(): MenuShown {
    return this.vr.menu.shown
  }

  get toolInHand(): Record<Hand, string> {
    return { left: this.vr.tools.left.tool, right: this.vr.tools.right.tool }
  }

  /** Whether the page's map shows over the globe. */
  get detailShown(): boolean {
    return this.vr.detail.mesh.visible
  }

  /** The question's picture over the menu, width by height in metres. */
  get pictureShown(): [number, number] | undefined {
    const { mesh } = this.vr.picture
    return mesh.visible ? [mesh.scale.x, mesh.scale.y] : undefined
  }

  /** The place the picture's postcard back names at the reveal. */
  get picturePostcard(): string | undefined {
    return this.vr.picture.postcardPlace
  }

  /** Whether a hand holds the question's picture, and where it is. */
  get pictureHeld(): {
    held: boolean
    at: [number, number, number]
    facing: [number, number, number]
    back: "reverse" | "postcard" | undefined
  } {
    const { picture } = this.vr
    const p = picture.mesh.getWorldPosition(new Vector3())
    const f = picture.mesh.getWorldDirection(new Vector3())
    return {
      held: picture.heldBy !== undefined,
      at: [p.x, p.y, p.z],
      facing: [f.x, f.y, f.z],
      back: picture.back
    }
  }

  /** Whether the controllers themselves show, rather than the can and eraser. */
  get controllersShown(): boolean {
    return HANDS.some((h) =>
      this.vr.world.input.xr.visualAdapters.controller[h].visual?.model.children.some((part) => part.visible)
    )
  }

  /** Whether a ray shows from either hand, to point at flags. */
  get beamsShown(): boolean {
    return HANDS.some((h) => this.vr.tools[h].beamShown)
  }

  /** How far the moon is from the globe, and how big, in globe radii. */
  get moonShown(): { distance: number; radius: number } | undefined {
    const { mesh } = this.vr.moon
    if (!mesh.visible) return undefined
    const r = this.vr.globe.radius
    return { distance: mesh.position.distanceTo(this.vr.globe.centre) / r, radius: mesh.scale.x / r }
  }

  get wristOpen(): boolean {
    return this.vr.wrist.open
  }

  get hintShown(): boolean {
    return this.vr.hint.band !== undefined
  }

  wristButtonAt(id: WristButton): [number, number, number] {
    return this.vr.wrist.buttonAt(id)
  }

  /** Where a hand's tool would land on the globe. */
  targetOf(hand: Hand): [number, number, number] | undefined {
    const p = this.vr.tools[hand].target
    return p && [p.x, p.y, p.z]
  }

  menuButtonAt(id: string): [number, number, number] {
    return this.vr.menu.buttonAt(id)
  }

  /** Where a row of the score table is. */
  scoreRowAt(i: number): [number, number, number] {
    return this.vr.scores.rowAt(i)
  }
}
