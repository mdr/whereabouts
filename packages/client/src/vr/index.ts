/**
 * Painting a round in a VR headset, on IWSDK (Meta's WebXR toolkit on
 * three.js). Its own chunk, loaded the first time a player asks for VR. One
 * world per page: it holds the WebGL context and the headset session, and
 * each round lends it the screen's PaintController, so paint sprayed here is
 * the same paint the map shows, scores and undoes.
 */
import {
  AmbientLight,
  Color,
  ColorSchemeType,
  DirectionalLight,
  Group,
  Hovered,
  InputComponent,
  PanelDocument,
  PanelUI,
  RayInteractable,
  ReferenceSpaceType,
  SessionMode,
  Vector3,
  VisibilityState,
  World,
  type Entity,
  type Object3D,
  type UIKitDocument
} from "@iwsdk/core"
import { effect, signal } from "@preact/signals"
import {
  describeHint,
  type HintAxis,
  type H3Cell,
  type HintBand,
  type LatLon,
  type MapDetail,
  type PaintLayer
} from "@whereabouts/shared"
import { loadLandMask, loadWaterMask } from "../land"
import { headsetPassthrough } from "../settings"
import type { PaintController } from "../paint-controller"
import { sound } from "../sound"
import { THEME } from "../themes"
import {
  ANSWER_RADIUS,
  DETAIL_RADIUS,
  Globe,
  HINT_RADIUS,
  OUTLINE_RADIUS,
  PAINT_RADIUS,
  PIN_RADIUS,
  type Hand
} from "./globe"
import { FlagPins, type Pointer, type VrFlagPin } from "./flag-pins"
import { AnswerMarker, type VrAnswer } from "./answer"
import { DetailPatch } from "./detail-patch"
import { drawBorders, drawColour, drawLand } from "./globe-texture"
import { paintGeometry } from "./paint-mesh"
import { Picture, type VrPicture } from "./picture"
import { HintMarker } from "./hint"
import { reflect, reflections } from "./models"
import { timerFrames } from "./frames"
import { HandTool, TRIGGER_DEAD } from "./spray"
import { Moon } from "./moon"
import { STARS_M, Space } from "./space"
import { latLonToLocal, localToLatLon } from "./sphere"
import { SCORES_M, ScoreBoard, type VrTable } from "./scores"
import { ResultsBoard, type VrBoard } from "./board"
import { WristMenu, type WristButton } from "./wrist"
import panelUrl from "./panel.uikitml?url"

export interface VrRound {
  paint: PaintController
  /** The question as the card words it. */
  prompt: string
  /** What the page's map shows while painting. */
  detail: MapDetail
  picture: VrPicture | undefined
  /** A lake or sea round: trimming drops paint on land, not at sea. */
  water: boolean
  /** Your paint's colour in a game, as the others see it; the map's ramp in practice. */
  colour?: string
  hint: HintBand | undefined
  hintsLeft: number | "unlimited" | "none"
  useHint(axis: HintAxis): void
  /** Ms until guessing ends, in a timed round. */
  msLeft?: () => number
  /** What Done is called; with nothing painted it is a pass, and says so. */
  doneLabel: string
  done(): void
  /** Done in a game, until Keep editing takes it back; undefined where it can't be. */
  unlock?: () => void
  /** Whether this player paints the round at all. */
  playing: boolean
  /** What the round means for this player just now: done, or sitting it out. */
  note?: string
}

/** A button on the menu: Next question, Ready, Play again. */
export interface VrAction {
  label: string
  press(): void
  enabled?: boolean
}

/** After a round: its answer and score. */
export interface VrReveal {
  label: string
  answer: VrAnswer
  /** Where the globe turns to show the answer. */
  focus: LatLon
  /** The map then shows state lines and names, as the page's does. */
  stateRound: boolean
  /** A line of interest about the answer. */
  fact?: string
  scoreLine: string
  /** Everyone's paint in their colours; your own paint when absent. */
  paints?: { layer: PaintLayer; colour: string }[]
  table?: VrTable
  note?: string
  actions: VrAction[]
  /** On a flag round: every country's flag, on or off; `pins` once the borders have loaded. */
  flags?: { on: boolean; toggle: () => void; pins: VrFlagPin[] | undefined }
}

export interface VrSummary {
  title: string
  scoreLine: string
  table?: VrTable
  note?: string
  actions: VrAction[]
  /** The awards and every round's scores, at the end of a game. */
  board?: VrBoard
}

/** What the headset shows: a menu, a round to paint, its answer, or the final score. */
export type VrView =
  | { kind: "paint"; round: VrRound }
  | { kind: "reveal"; round: VrRound; reveal: VrReveal }
  | { kind: "done"; summary: VrSummary }
  /** Before a game: the home screen or a game's lobby. */
  | { kind: "lobby"; summary: VrSummary }

const HANDS = ["left", "right"] as const
const HEADINGS: Record<VrView["kind"], string> = {
  lobby: "WELCOME",
  paint: "THIS ROUND",
  reveal: "THE ANSWER",
  done: "GAME OVER"
}
/** Rebuilding the paint is the costly part of a stroke, so at most this often. */
const PAINT_REDRAW_S = 0.1
const PANEL_M = 0.38
/** The gap a panel keeps from the globe, in radians as seen from the player. */
const PANEL_CLEAR = 0.04
const UP = new Vector3(0, 1, 0)
/** How long a new session may take to open, when switching to or from passthrough. */
const SWITCH_MS = 5000
/** From this zoom on, the page's map shows over the globe. */
const DETAIL_SCALE = 2
/** How far either side of the near point the map covers. */
const DETAIL_HALF_M = 0.6

export class Vr {
  readonly active = signal(false)
  /** Cells of paint the globe last drew, for the browser tests. */
  shownPaintCells = 0
  /** Frames drawn, for the browser tests to wait on frames rather than time. */
  frames = 0
  /** Menu buttons clicked, for the browser tests to know a press landed. */
  clicks = 0
  private view: VrView | undefined = undefined
  private pictureKey = ""
  private stroking = false
  private placed = false
  private paintDirty = true
  private lastPaintDraw = 0
  private stopPaintWatch: (() => void) | undefined = undefined
  private readonly globe: Globe
  private readonly detail: DetailPatch
  private readonly picture = new Picture()
  private readonly answer = new AnswerMarker(THEME, ANSWER_RADIUS)
  private readonly hint = new HintMarker(HINT_RADIUS)
  private readonly wrist: WristMenu
  private readonly scores: ScoreBoard
  private readonly board = new ResultsBoard()
  private readonly flagPins = new FlagPins(PIN_RADIUS, OUTLINE_RADIUS)
  private readonly space = new Space()
  private readonly moon = new Moon()
  /** Whether the headset can show the room (immersive-ar), once asked. */
  private passthroughOffered = false
  /** Ending one kind of session to start the other. */
  private switching = false
  /** Where the panels were placed, and from where. */
  private homes: { obj: Object3D; at: Vector3; half: number }[] = []
  private readonly eye = new Vector3()
  /** What the menu last said, so it is set only when it changes. */
  private doneText = ""
  private clockText = ""
  private readonly tools: Record<Hand, HandTool>
  private readonly panel: Entity
  private panelDoc: UIKitDocument | undefined = undefined

  static async create(onStage: (stage: "headset" | "land") => void): Promise<Vr> {
    onStage("headset")
    // WebGL needs somewhere to put its canvas; in the headset nobody sees the page.
    const host = document.createElement("div")
    host.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none"
    document.body.append(host)
    const world = await World.create(host, {
      xr: {
        sessionMode: SessionMode.ImmersiveVR,
        referenceSpace: ReferenceSpaceType.LocalFloor,
        offer: "none"
      },
      features: { spatialUI: { preferredColorScheme: ColorSchemeType.Dark } },
      input: { canvasPointerEvents: false },
      // The moon of a globe zoomed right in is kilometres off.
      render: { far: STARS_M * 1.2 }
    })
    const vr = new Vr(world)
    onStage("land")
    // Drawn now, while the page says it is loading, so the pause never comes in the headset.
    const [land, borders] = await Promise.all([
      import("@whereabouts/shared/land.json"),
      import("@whereabouts/shared/borders.json")
    ])
    // The drawing holds the page up for a second: let it show the stage first.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
    const landOnly = drawLand(vr.globe.landCanvas, land.default, THEME)
    vr.globe.landDrawn(world.renderer)
    drawBorders(vr.globe.bordersCanvas, borders.default, THEME)
    vr.globe.bordersDrawn(world.renderer)
    // Not needed until the first answer, and it waits on the network.
    drawColour(vr.globe.colourCanvas, vr.globe.landCanvas, landOnly).then(
      () => vr.globe.colourDrawn(world.renderer),
      (err: unknown) => console.warn("could not colour the VR globe", err)
    )
    window.whereaboutsVr = vr
    return vr
  }

  private readonly world: World

  private constructor(world: World) {
    this.world = world
    world.scene.background = new Color("#03050b")
    world.scene.add(this.space.group, this.moon.mesh)
    world.scene.add(new AmbientLight(0xffffff, 1.2))
    const sun = new DirectionalLight(0xffffff, 1.5)
    sun.position.set(1, 3, 2)
    world.scene.add(sun)

    this.globe = new Globe(world.renderer.capabilities.getMaxAnisotropy())
    world.scene.add(this.globe.group, this.globe.stand)
    this.detail = new DetailPatch(THEME, DETAIL_RADIUS, world.renderer.capabilities.getMaxAnisotropy())
    this.detail.mesh.renderOrder = 1
    this.globe.overlay(this.detail.mesh, DETAIL_RADIUS)
    this.globe.overlay(this.answer.group, ANSWER_RADIUS)
    this.globe.overlay(this.hint.group, HINT_RADIUS)
    this.globe.overlay(this.flagPins.group, PIN_RADIUS)
    this.globe.overlay(this.flagPins.border, OUTLINE_RADIUS)
    world.scene.add(this.flagPins.label)

    const { gripSpaces, raySpaces } = world.player
    this.tools = {
      left: new HandTool(gripSpaces.left, raySpaces.left, world.scene, THEME),
      right: new HandTool(gripSpaces.right, raySpaces.right, world.scene, THEME)
    }
    this.tools.left.setTool("erase")
    const room = reflections(world.renderer)
    for (const o of [this.globe.stand, gripSpaces.left, gripSpaces.right]) reflect(o, room)

    this.panel = world.createTransformEntity(new Group(), { persistent: true })
    this.panel.addComponent(RayInteractable)
    this.panel.addComponent(PanelUI, { config: panelUrl })
    this.panel.object3D!.add(this.picture.mesh)
    this.wrist = new WristMenu(
      world,
      Object.fromEntries(
        Object.entries(this.wristHandlers()).map(([id, f]) => [
          id,
          () => {
            this.clicks++
            f()
          }
        ])
      ) as Record<WristButton, () => void>
    )
    this.scores = new ScoreBoard(world)
    world.scene.add(this.board.mesh)

    void navigator.xr?.isSessionSupported(SessionMode.ImmersiveAR).then((ok) => {
      this.passthroughOffered = ok
      this.applyView()
    })
    world.visibilityState.subscribe((state) => {
      const active = state !== VisibilityState.NonImmersive
      if (!active && this.switching) {
        // Still within the press's activation, which a new session needs.
        this.switching = false
        this.launch()
        // Refused, it leaves the player on the page.
        setTimeout(() => {
          if (this.world.visibilityState.value === VisibilityState.NonImmersive) this.ended()
        }, SWITCH_MS)
        return
      }
      if (active === this.active.value) return
      if (active) {
        timerFrames(true)
        this.active.value = true
      } else this.ended()
    })
    world.onXRFrame((_frame, delta, time) => this.frame(delta, time))
  }

  /** Call from the click that asked for VR: the browser only opens a headset session in answer to one. */
  enter(view: VrView): void {
    this.placed = false
    this.show(view)
    this.launch()
  }

  private launch(): void {
    const passthrough = headsetPassthrough.value
    this.space.group.visible = this.moon.mesh.visible = !passthrough
    this.world.launchXR({ sessionMode: passthrough ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR })
  }

  /** Swaps space for the room round the player, or back: a new session of the other kind. */
  private togglePassthrough(): void {
    if (this.switching) return
    headsetPassthrough.value = !headsetPassthrough.value
    this.switching = true
    this.world.exitXR()
  }

  /** Change what the headset shows, as the screen moves from round to answer to round. */
  show(view: VrView): void {
    this.endStroke()
    this.picture.release(this.panel.object3D!)
    this.view = view
    const round = this.round
    const picture = round?.picture
    const key = picture ? JSON.stringify(picture) : ""
    if (key !== this.pictureKey) {
      this.pictureKey = key
      this.picture.show(picture)
    }
    this.answer.show(view.kind === "reveal" ? view.reveal.answer : undefined)
    if (view.kind === "reveal" && this.placed) {
      const { at, reach } = framing(view.reveal, view.round)
      this.globe.turnToward(at, reach, this.world.player.head.getWorldPosition(new Vector3()))
    }
    this.paintDirty = true
    this.stopPaintWatch?.()
    this.stopPaintWatch = round
      ? effect(() => {
          // oxlint-disable-next-line typescript/no-unused-expressions -- the read is the dependency
          round.paint.version.value
          this.paintDirty = true
        })
      : undefined
    this.refresh(view)
  }

  /** The same round, answer or score, as it changes: the clock, Done, who is ready. */
  refresh(view: VrView): void {
    this.view = view
    const round = this.round
    if (round) this.detail.setDetail(view.kind === "reveal" ? { stateRound: view.reveal.stateRound } : round.detail)
    this.hint.show(round?.hint)
    this.detail.setHint(round?.hint)
    if (round) this.wrist.setState(round.water, round.hint && describeHint(round.hint), round.hintsLeft)
    for (const h of HANDS) this.tools[h].setColour(round?.colour)
    // As the page's map: natural colour on the reveal, and while painting on the maps that show terrain.
    this.globe.showColour(
      view.kind === "reveal" || (view.kind === "paint" && ["physical", "political"].includes(view.round.detail))
    )
    this.globe.showBorders(view.kind === "reveal" || (view.kind === "paint" && view.round.detail === "political"))
    this.scores.show(view.kind === "reveal" ? view.reveal.table : "summary" in view ? view.summary.table : undefined)
    this.board.show("summary" in view ? view.summary.board : undefined)
    const flags = view.kind === "reveal" ? view.reveal.flags : undefined
    this.flagPins.show(flags?.on ? flags.pins : undefined)
    this.applyView()
  }

  /** The reveal's line of interest, for the browser tests. */
  get factShown(): string | undefined {
    return this.view?.kind === "reveal" ? this.view.reveal.fact : undefined
  }

  /** What the headset shows, for the browser tests. */
  get viewKind(): VrView["kind"] | undefined {
    return this.view?.kind
  }

  private get round(): VrRound | undefined {
    return this.view && "round" in this.view ? this.view.round : undefined
  }

  /** The round, while this player may paint it. */
  private get painting(): VrRound | undefined {
    const round = this.round
    return this.view?.kind === "paint" && round?.playing && round.paint.enabled.value ? round : undefined
  }

  /** The score table, for the browser tests. */
  get tableShown(): VrTable | undefined {
    return this.scores.shown
  }

  /** Droplets and crumbs in the air, for the browser tests. */
  get particlesLive(): number {
    return this.tools.left.particlesLive + this.tools.right.particlesLive
  }

  /** The narrowest gap, in radians as the player sees it, between a panel and the globe. */
  get panelGap(): number {
    const eye = this.eye
    const yaw = (p: Vector3) => Math.atan2(p.x - eye.x, p.z - eye.z)
    const flat = (p: Vector3) => Math.hypot(p.x - eye.x, p.z - eye.z)
    const centre = this.globe.centre
    const globeHalf = Math.asin(Math.min(1, this.globe.radius / flat(centre)))
    return Math.min(
      ...this.homes.map(({ obj, half }) => {
        const d = yaw(obj.position) - yaw(centre)
        return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) - globeHalf - Math.atan(half / flat(obj.position))
      })
    )
  }

  get flagPinsShown(): number {
    return this.flagPins.shown
  }

  /** The country whose flag is pointed at, for the browser tests. */
  get flagNamed(): string | undefined {
    return this.flagPins.named
  }

  /** The country whose border is picked out, and in how many line segments, for the browser tests. */
  get flagOutlined(): { name: string; segments: number } | undefined {
    return this.flagPins.outlined
  }

  /** The flag nearest the eyes, and where, for the browser tests. */
  get flagFacing(): { name: string; at: [number, number, number] } | undefined {
    const f = this.flagPins.nearest(this.world.player.head.getWorldPosition(new Vector3()))
    return f && { name: f.name, at: [f.at.x, f.at.y, f.at.z] }
  }

  /** How much paint the round has, all cells' intensities summed, for the browser tests. */
  get paintMass(): number {
    return this.round?.paint.layer.mass() ?? 0
  }

  /** Whether the globe is turning to show a place, for the browser tests. */
  get globeTurning(): boolean {
    return this.globe.busy
  }

  /** How far the globe is zoomed, for the browser tests. */
  get globeScale(): number {
    return this.globe.scale
  }

  /** Whether the hands hold their tools, and space shows, for the browser tests. */
  get toolsHeld(): boolean {
    return this.tools.left.held || this.tools.right.held
  }

  get spaceShown(): boolean {
    return this.space.group.visible
  }

  get passthrough(): boolean {
    return headsetPassthrough.value
  }

  get boardShown(): VrBoard | undefined {
    return this.board.mesh.visible ? this.board.shown : undefined
  }

  /** Whether the land shows in natural colour, for the browser tests. */
  get colourShown(): boolean {
    return this.globe.colourShown
  }

  get bordersShown(): boolean {
    return this.globe.bordersShown
  }

  /** What the menu offers, for the browser tests. */
  get menuShown(): { done: string; clock: string; unlock: boolean; actions: { label: string; enabled: boolean }[] } {
    const round = this.view?.kind === "paint" ? this.view.round : undefined
    return {
      done: this.doneText,
      clock: this.clockText,
      unlock: round?.unlock !== undefined,
      actions: this.actions.map((a) => ({ label: a.label, enabled: a.enabled !== false }))
    }
  }

  /** Whether the page's map shows over the globe, for the browser tests. */
  get detailShown(): boolean {
    return this.detail.mesh.visible
  }

  /** The question's picture over the menu, width by height in metres, for the browser tests. */
  get pictureShown(): [number, number] | undefined {
    const { mesh } = this.picture
    return mesh.visible ? [mesh.scale.x, mesh.scale.y] : undefined
  }

  /** Whether a hand holds the question's picture, and where it is, for the browser tests. */
  get pictureHeld(): { held: boolean; at: [number, number, number]; facing: [number, number, number] } {
    const p = this.picture.mesh.getWorldPosition(new Vector3())
    const f = this.picture.mesh.getWorldDirection(new Vector3())
    return { held: this.picture.heldBy !== undefined, at: [p.x, p.y, p.z], facing: [f.x, f.y, f.z] }
  }

  /**
   * While painting, the can and eraser stand in for the controllers. Not
   * toggleVisual(): IWSDK sets the model itself visible again every frame,
   * but leaves the parts inside it alone. The model loads some frames into
   * the session.
   */
  private showControllers(on: boolean): void {
    for (const h of HANDS) {
      const model = this.world.input.xr.visualAdapters.controller[h].visual?.model
      if (model) for (const part of model.children) part.visible = on
    }
  }

  /** Whether the controllers themselves show, for the browser tests. */
  get controllersShown(): boolean {
    return HANDS.some((h) =>
      this.world.input.xr.visualAdapters.controller[h].visual?.model.children.some((part) => part.visible)
    )
  }

  /** Whether a ray shows from either hand, to point at flags, for the browser tests. */
  get beamsShown(): boolean {
    return HANDS.some((h) => this.tools[h].beamShown)
  }

  /** How far the moon is from the globe, and how big, in globe radii, for the browser tests. */
  get moonShown(): { distance: number; radius: number } | undefined {
    const { mesh } = this.moon
    if (!mesh.visible) return undefined
    const r = this.globe.radius
    return { distance: mesh.position.distanceTo(this.globe.centre) / r, radius: mesh.scale.x / r }
  }

  get wristOpen(): boolean {
    return this.wrist.open
  }

  get hintShown(): boolean {
    return this.hint.band !== undefined
  }

  /** Where a button on the wrist menu is, for the browser tests. */
  wristButtonAt(id: WristButton): [number, number, number] {
    return this.wrist.buttonAt(id)
  }

  private wristHandlers(): Record<WristButton, () => void> {
    // Each acts on the round being painted, and the globe redraws its paint.
    const act = (f: (round: VrRound) => void) => () => {
      const round = this.painting
      if (!round) return
      f(round)
      this.paintDirty = true
    }
    const trimmed = (share: number, none: string) => {
      if (share > 0) sound.play("clear")
      this.wrist.note(share > 0 ? `Trimmed ${Math.max(1, Math.round(share * 100))}%` : none)
      this.paintDirty = true
    }
    return {
      undo: act((r) => r.paint.undo()),
      swap: () => {
        const right = this.tools.right.tool
        this.tools.right.setTool(this.tools.left.tool)
        this.tools.left.setTool(right)
      },
      latitude: act((r) => r.useHint("latitude")),
      longitude: act((r) => r.useHint("longitude")),
      trim: act((r) => {
        const trim = r.water
          ? loadWaterMask().then((mask) => trimmed(r.paint.trimLand(mask), "None on land"))
          : loadLandMask().then((mask) => trimmed(r.paint.trimSea(mask), "None at sea"))
        trim.catch((err: unknown) => {
          console.warn("could not load the trim mask", err)
          this.wrist.note("Try again")
        })
      }),
      trimHint: act((r) => r.hint && trimmed(r.paint.trimToHint(r.hint), "None outside")),
      clear: act((r) => {
        if (!r.paint.layer.isEmpty) sound.play("clear")
        r.paint.clear()
      }),
      redo: act((r) => r.paint.redo())
    }
  }

  /** Where a hand's tool would land on the globe, for the browser tests. */
  targetOf(hand: Hand): [number, number, number] | undefined {
    const p = this.tools[hand].target
    return p && [p.x, p.y, p.z]
  }

  /** Where a button on the menu is, for the browser tests. */
  menuButtonAt(id: string): [number, number, number] {
    const p = this.panelDoc!.requireElementById(id).getWorldPosition(new Vector3())
    return [p.x, p.y, p.z]
  }

  exit(): void {
    if (this.active.value) this.world.exitXR()
  }

  private ended(): void {
    if (!this.active.value) return
    timerFrames(false)
    this.active.value = false
    this.leave()
  }

  private leave(): void {
    this.endStroke()
    this.picture.release(this.panel.object3D!)
    this.stopPaintWatch?.()
    this.stopPaintWatch = undefined
    this.view = undefined
  }

  private frame(dt: number, now: number): void {
    this.frames++
    this.showControllers(this.painting === undefined)
    if (!this.view) return
    const { player } = this.world
    if (!this.placed) {
      const head = player.head.getWorldPosition(new Vector3())
      const forward = player.head.getWorldDirection(new Vector3()).negate()
      this.globe.place(head, forward)
      this.placePanel(head, forward)
      this.scores.place(head, forward)
      this.board.place(head, forward)
      this.eye.copy(head)
      this.homes = [
        { obj: this.panel.object3D!, at: this.panel.object3D!.position.clone(), half: PANEL_M / 2 },
        { obj: this.scores.object3D, at: this.scores.object3D.position.clone(), half: SCORES_M / 2 }
      ]
      this.placed = true
    }
    this.clearGlobe()
    this.wirePanel()
    this.scores.update()
    this.placePicture()

    const pads = this.world.input.xr.gamepads
    const grips: Partial<Record<Hand, Vector3>> = {}
    const stick = { x: 0, y: 0 }
    for (const h of HANDS) {
      const pad = pads[h]
      this.tools[h].busy = false
      if (!pad) continue
      const grip = player.gripSpaces[h].getWorldPosition(new Vector3())
      const squeezed = pad.getButtonPressed(InputComponent.Squeeze)
      this.tools[h].busy = squeezed
      if (pad.getButtonDown(InputComponent.Squeeze) && !this.picture.heldBy) {
        const ray = player.raySpaces[h]
        const origin = ray.getWorldPosition(new Vector3())
        if (this.picture.reaches(grip, origin, ray.getWorldDirection(new Vector3()).negate()))
          this.picture.grab(h, this.world.scene, player.gripSpaces[h], player.head.getWorldPosition(new Vector3()))
      }
      if (this.picture.heldBy === h && !squeezed) this.picture.release(this.panel.object3D!)
      if (squeezed && this.picture.heldBy !== h) grips[h] = grip
      const s = pad.getAxesValues(InputComponent.Thumbstick)
      stick.x += s?.x ?? 0
      stick.y += s?.y ?? 0
    }
    this.globe.update(dt, grips, stick)
    const head = player.head.getWorldPosition(new Vector3())
    const zoomed = this.globe.scale >= DETAIL_SCALE
    this.detail.update(now, this.globe.nearest(head), zoomed ? (DETAIL_HALF_M * 6371) / this.globe.radius : undefined)
    this.answer.update(this.globe.scale)
    this.space.update(head)
    this.moon.update(dt, this.globe.centre, this.globe.radius)
    const pointing = this.view.kind === "reveal" && this.flagPins.shown > 0
    const pointers: Pointer[] = HANDS.map((h) => ({ ...this.tools[h].pointer(), globe: this.tools[h].aim(this.globe) }))
    this.flagPins.update(this.globe.scale, pointing ? pointers : [], head)
    for (const h of HANDS) this.tools[h].showBeam(pointing ? this.globe : undefined)
    this.wrist.update(this.painting !== undefined, player.gripSpaces.left, head)
    for (const h of HANDS) this.tools[h].hold(this.painting !== undefined)

    const round = this.round
    if (round && this.paintDirty && now - this.lastPaintDraw >= PAINT_REDRAW_S) {
      const paints = this.view.kind === "reveal" ? this.view.reveal.paints : undefined
      const paint = paints ? colouredPaint(paints) : round.paint.layer.toGeoJSON()
      this.globe.showPaint(paintGeometry(paint, THEME, PAINT_RADIUS, paints ? undefined : round.colour))
      this.shownPaintCells = paint.features.length
      this.paintDirty = false
      this.lastPaintDraw = now
    }
    this.updateLabels(round)
    if (!this.painting || !round) {
      for (const h of HANDS) {
        this.tools[h].hide()
        this.tools[h].settle(now)
      }
      return
    }

    // A swaps the right hand's tool, X the left's.
    for (const [h, button] of [
      ["right", InputComponent.A_Button],
      ["left", InputComponent.X_Button]
    ] as const) {
      const tool = this.tools[h]
      if (pads[h]?.getButtonDown(button)) tool.setTool(tool.tool === "paint" ? "erase" : "paint")
    }

    // The trigger also presses the menu's buttons; pointing at it, it sprays nothing.
    const onMenu = this.panel.hasComponent(Hovered) || this.wrist.hovered
    // The left hand is turned to show the wrist menu, not to erase.
    const triggers = HANDS.map((h) =>
      h === "left" && this.wrist.open ? 0 : (pads[h]?.getButtonValue(InputComponent.Trigger) ?? 0)
    )
    const working = onMenu
      ? undefined
      : HANDS.find(
          (h, i) =>
            this.tools[h].touching(this.globe) !== undefined ||
            (!this.tools[h].busy && triggers[i]! > TRIGGER_DEAD && this.tools[h].aim(this.globe) !== undefined)
        )
    if (working && !this.stroking) {
      // Both hands make one undo step; the first sets the stroke's sound.
      round.paint.beginOutsideStroke(this.tools[working].tool)
      this.stroking = true
    }
    // Every hand updates, even once one has sprayed: each moves its own spot.
    const sprayed = HANDS.map((h, i) =>
      this.tools[h].update(now, this.globe, triggers[i]!, onMenu, round.paint, pads[h]?.gamepad)
    )
    // Sooner than paint.version, which waits a little for an animation frame.
    if (sprayed.includes(true)) this.paintDirty = true
    else this.endStroke()
  }

  private endStroke(): void {
    if (!this.stroking) return
    this.round?.paint.endOutsideStroke()
    this.stroking = false
  }

  /** On top of the menu, which grows and shrinks with its text. */
  private placePicture(): void {
    const size = this.panelDoc?.computedSize
    if (!size || this.picture.heldBy) return
    // The menu is scaled to fit a PANEL_M square, whatever its own units.
    const top = (size.height * Math.min(PANEL_M / size.width, PANEL_M / size.height)) / 2
    this.picture.mesh.position.set(0, top + 0.015 + this.picture.height / 2, 0)
  }

  /** To the left of the globe, turned to face the player. */
  /**
   * Swings each panel round the player, from where it was placed, until it
   * clears the globe as seen from there: zooming in pushes them aside.
   */
  private clearGlobe(): void {
    const eye = this.eye
    const yaw = (p: Vector3) => Math.atan2(p.x - eye.x, p.z - eye.z)
    const flat = (p: Vector3) => Math.hypot(p.x - eye.x, p.z - eye.z)
    const centre = this.globe.centre
    const globeHalf = Math.asin(Math.min(1, this.globe.radius / Math.max(1e-6, flat(centre))))
    const globeYaw = yaw(centre)
    for (const { obj, at, half } of this.homes) {
      const offset = Math.atan2(Math.sin(yaw(at) - globeYaw), Math.cos(yaw(at) - globeYaw))
      const need = globeHalf + Math.atan(half / flat(at)) + PANEL_CLEAR
      const by = Math.abs(offset) >= need ? 0 : Math.sign(offset || 1) * need - offset
      obj.position.copy(at).sub(eye).applyAxisAngle(UP, by).add(eye)
      obj.lookAt(eye)
    }
  }

  private placePanel(head: Vector3, forward: Vector3): void {
    const obj = this.panel.object3D!
    const level = new Vector3(forward.x, 0, forward.z).normalize()
    const left = new Vector3(level.z, 0, -level.x)
    obj.position
      .copy(head)
      .addScaledVector(level, 0.55)
      .addScaledVector(left, 0.5)
      .add(new Vector3(0, -0.1, 0))
    obj.lookAt(head)
  }

  /** The menu loads on its own time; hook its buttons up once it has. */
  private wirePanel(): void {
    if (this.panelDoc || !this.panel.hasComponent(PanelDocument)) return
    const doc = PanelDocument.data.document[this.panel.index] as UIKitDocument
    this.panelDoc = doc
    doc.setTargetDimensions(PANEL_M, PANEL_M)
    const on = (id: string, f: () => void) =>
      doc.requireElementById(id).addEventListener("click", () => {
        this.clicks++
        f()
      })
    on("done", () => this.painting?.done())
    on("unlock", () => this.view?.kind === "paint" && this.view.round.unlock?.())
    for (const i of [0, 1]) {
      on(`act${i}`, () => {
        const action = this.actions[i]
        if (action && action.enabled !== false) action.press()
      })
    }
    on("flags", () => this.view?.kind === "reveal" && this.view.reveal.flags?.toggle())
    on("passthrough", () => this.togglePassthrough())
    on("exit", () => this.exit())
    this.applyView()
  }

  private get actions(): VrAction[] {
    const view = this.view
    return view?.kind === "reveal" ? view.reveal.actions : view && "summary" in view ? view.summary.actions : []
  }

  /** Done says Pass with nothing painted, and the clock counts down. */
  private updateLabels(round: VrRound | undefined): void {
    const doc = this.panelDoc
    if (!doc || !round || this.view?.kind !== "paint") return
    const done = round.paint.layer.isEmpty ? "Pass" : round.doneLabel
    if (done !== this.doneText) {
      this.doneText = done
      doc.getElementById("doneLabel")?.setProperties({ text: done })
    }
    if (!round.msLeft) return
    const s = Math.ceil(Math.max(0, round.msLeft()) / 1000)
    const clock = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left` : "Time's up"
    if (clock !== this.clockText) {
      this.clockText = clock
      doc.getElementById("clock")?.setProperties({ text: clock })
    }
  }

  private applyView(): void {
    const doc = this.panelDoc
    const view = this.view
    if (!doc || !view) return
    const show = (id: string, on: boolean) => doc.getElementById(id)?.setProperties({ display: on ? "flex" : "none" })
    const text = (id: string, t: string) => doc.getElementById(id)?.setProperties({ text: t })
    const reveal = view.kind === "reveal" ? view.reveal : undefined
    const summary = "summary" in view ? view.summary : undefined
    const round = view.kind === "paint" ? view.round : undefined
    const painting = round?.playing === true && round.unlock === undefined
    show("hint", painting)
    show("done", painting)
    show("unlock", round?.unlock !== undefined)
    show("clock", round?.msLeft !== undefined)
    show("score", round === undefined)
    const note = round?.note ?? reveal?.note ?? summary?.note
    show("note", note !== undefined)
    if (note !== undefined) text("note", note)
    const actions = this.actions
    for (const i of [0, 1]) {
      const action = actions[i]
      show(`act${i}`, action !== undefined)
      if (!action) continue
      text(`act${i}Label`, action.label)
      doc.getElementById(`act${i}`)?.setProperties({ disabled: action.enabled === false })
    }
    text("heading", HEADINGS[view.kind])
    show("extras", reveal?.flags !== undefined)
    show("modes", this.passthroughOffered)
    text("passthroughLabel", headsetPassthrough.value ? "Show space" : "See your room")
    if (reveal?.flags) text("flagsLabel", reveal.flags.on ? "Hide all flags" : "Show all flags")
    if (round) text("prompt", round.prompt)
    show("fact", reveal?.fact !== undefined)
    if (reveal) {
      text("prompt", reveal.label)
      text("score", reveal.scoreLine)
      if (reveal.fact !== undefined) text("fact", reveal.fact)
    }
    if (summary) {
      text("prompt", summary.title)
      text("score", summary.scoreLine)
    }
    // Set again from the round next frame.
    this.doneText = this.clockText = ""
  }
}

/**
 * Where the reveal turns the globe to, and how wide round it to show: the
 * answer and every guess's paint.
 */
function framing(reveal: VrReveal, round: VrRound): { at: LatLon; reach: number } {
  const points = [latLonToLocal(reveal.focus)]
  const { answer } = reveal
  if ("outline" in answer)
    for (const polygon of answer.outline)
      for (const [lon, lat] of polygon[0] ?? []) points.push(latLonToLocal({ lat: lat!, lon: lon! }))
  for (const { layer } of reveal.paints ?? [{ layer: round.paint.layer }])
    for (const h of Object.keys(layer.toRecord()) as H3Cell[]) {
      const [lat, lon] = layer.centre(h)
      points.push(latLonToLocal({ lat, lon }))
    }
  const mid = points.reduce((sum, p) => sum.add(p), new Vector3())
  // Spread round the world: show it all.
  if (mid.length() < points.length * 0.2) return { at: reveal.focus, reach: Math.PI }
  mid.normalize()
  const reach = Math.max(...points.map((p) => p.angleTo(mid)))
  return { at: localToLatLon(mid), reach: reach * 1.15 + 0.002 }
}

/** Several players' paint as one collection, each cell in its player's colour. */
function colouredPaint(
  paints: { layer: PaintLayer; colour: string }[]
): GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number; colour?: string }> {
  return {
    type: "FeatureCollection",
    features: paints.flatMap(({ layer, colour }) =>
      layer.toGeoJSON().features.map((f) => ({ ...f, properties: { ...f.properties, colour } }))
    )
  }
}

declare global {
  interface Window {
    whereaboutsVr: Vr
  }
}
