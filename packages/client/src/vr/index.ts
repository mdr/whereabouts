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
  type UIKitDocument
} from "@iwsdk/core"
import { effect, signal } from "@preact/signals"
import type { LatLon, MapDetail } from "@whereabouts/shared"
import type { PaintController } from "../paint-controller"
import { THEME } from "../themes"
import { ANSWER_RADIUS, DETAIL_RADIUS, Globe, PAINT_RADIUS, type Hand } from "./globe"
import { AnswerMarker, type VrAnswer } from "./answer"
import { DetailPatch } from "./detail-patch"
import { drawLand } from "./globe-texture"
import { paintGeometry } from "./paint-mesh"
import { Picture, type VrPicture } from "./picture"
import { SprayCan, TRIGGER_DEAD, type SprayTool } from "./spray"
import panelUrl from "./panel.uikitml?url"

export interface VrRound {
  paint: PaintController
  /** The question as the card words it. */
  prompt: string
  /** What the page's map shows while painting. */
  detail: MapDetail
  picture: VrPicture | undefined
  submit(): void
}

/** After a round: its answer and score. */
export interface VrReveal {
  label: string
  answer: VrAnswer
  /** Where the globe turns to show the answer. */
  focus: LatLon
  score: number
  total: number
  last: boolean
  next(): void
}

export interface VrSummary {
  total: number
  max: number
  again(): void
}

/** What the headset shows: a round to paint, its answer, or the final score. */
export type VrView =
  | { kind: "paint"; round: VrRound }
  | { kind: "reveal"; round: VrRound; reveal: VrReveal }
  | { kind: "done"; summary: VrSummary }

const HANDS = ["left", "right"] as const
/** Rebuilding the paint is the costly part of a stroke, so at most this often. */
const PAINT_REDRAW_S = 0.1
const PANEL_M = 0.38
/** From this zoom on, the page's map shows over the globe. */
const DETAIL_SCALE = 2
/** How far either side of the near point the map covers. */
const DETAIL_HALF_M = 0.6

export class Vr {
  readonly active = signal(false)
  /** Cells of paint the globe last drew, for the browser tests. */
  shownPaintCells = 0
  private view: VrView | undefined = undefined
  private pictureKey = ""
  private tool: SprayTool = "paint"
  private stroking = false
  private placed = false
  private paintDirty = true
  private lastPaintDraw = 0
  private stopPaintWatch: (() => void) | undefined = undefined
  private readonly globe: Globe
  private readonly detail: DetailPatch
  private readonly picture = new Picture()
  private readonly answer = new AnswerMarker(THEME, ANSWER_RADIUS)
  private readonly cans: Record<Hand, SprayCan>
  private readonly panel: Entity
  private panelDoc: UIKitDocument | undefined = undefined

  static async create(): Promise<Vr> {
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
      input: { canvasPointerEvents: false }
    })
    const vr = new Vr(world)
    // Drawn now, while the page says it is loading, so the pause never comes in the headset.
    const [land, borders] = await Promise.all([
      import("@whereabouts/shared/land.json"),
      import("@whereabouts/shared/borders.json")
    ])
    drawLand(vr.globe.landCanvas, land.default, borders.default, THEME)
    vr.globe.landDrawn(world.renderer)
    window.whereaboutsVr = vr
    return vr
  }

  private readonly world: World

  private constructor(world: World) {
    this.world = world
    world.scene.background = new Color("#0b1016")
    world.scene.add(new AmbientLight(0xffffff, 1.2))
    const sun = new DirectionalLight(0xffffff, 1.5)
    sun.position.set(1, 3, 2)
    world.scene.add(sun)

    this.globe = new Globe(world.renderer.capabilities.getMaxAnisotropy())
    world.scene.add(this.globe.group)
    this.detail = new DetailPatch(THEME, DETAIL_RADIUS, world.renderer.capabilities.getMaxAnisotropy())
    this.globe.add(this.detail.mesh)
    this.globe.group.add(this.answer.group)

    const { gripSpaces, raySpaces } = world.player
    this.cans = {
      left: new SprayCan(gripSpaces.left, raySpaces.left, world.scene, THEME),
      right: new SprayCan(gripSpaces.right, raySpaces.right, world.scene, THEME)
    }

    this.panel = world.createTransformEntity(new Group(), { persistent: true })
    this.panel.addComponent(RayInteractable)
    this.panel.addComponent(PanelUI, { config: panelUrl })
    this.panel.object3D!.add(this.picture.mesh)

    world.visibilityState.subscribe((state) => {
      const active = state !== VisibilityState.NonImmersive
      if (active === this.active.value) return
      this.active.value = active
      if (!active) this.leave()
    })
    world.onXRFrame((_frame, delta, time) => this.frame(delta, time))
  }

  /** Call from the click that asked for VR: the browser only opens a headset session in answer to one. */
  enter(view: VrView): void {
    this.placed = false
    this.show(view)
    this.world.launchXR()
  }

  /** Change what the headset shows, as the screen moves from round to answer to round. */
  show(view: VrView): void {
    this.endStroke()
    this.picture.release(this.panel.object3D!)
    this.view = view
    const round = this.round
    if (view.kind === "paint") this.setTool("paint")
    if (round) this.detail.setDetail(round.detail)
    const picture = round?.picture
    const key = picture ? JSON.stringify(picture) : ""
    if (key !== this.pictureKey) {
      this.pictureKey = key
      this.picture.show(picture)
    }
    this.answer.show(view.kind === "reveal" ? view.reveal.answer : undefined)
    if (view.kind === "reveal" && this.placed)
      this.globe.turnToward(view.reveal.focus, this.world.player.head.getWorldPosition(new Vector3()))
    this.paintDirty = true
    this.stopPaintWatch?.()
    this.stopPaintWatch = round
      ? effect(() => {
          // oxlint-disable-next-line typescript/no-unused-expressions -- the read is the dependency
          round.paint.version.value
          this.paintDirty = true
        })
      : undefined
    this.applyView()
  }

  /** What the headset shows, for the browser tests. */
  get viewKind(): VrView["kind"] | undefined {
    return this.view?.kind
  }

  private get round(): VrRound | undefined {
    return this.view && "round" in this.view ? this.view.round : undefined
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
  get pictureHeld(): { held: boolean; at: [number, number, number] } {
    const p = this.picture.mesh.getWorldPosition(new Vector3())
    return { held: this.picture.heldBy !== undefined, at: [p.x, p.y, p.z] }
  }

  exit(): void {
    if (this.active.value) this.world.exitXR()
  }

  private leave(): void {
    this.endStroke()
    this.picture.release(this.panel.object3D!)
    this.stopPaintWatch?.()
    this.stopPaintWatch = undefined
    this.view = undefined
  }

  private frame(dt: number, now: number): void {
    if (!this.view) return
    const { player } = this.world
    if (!this.placed) {
      const head = player.head.getWorldPosition(new Vector3())
      const forward = player.head.getWorldDirection(new Vector3()).negate()
      this.globe.place(head, forward)
      this.placePanel(head, forward)
      this.placed = true
    }
    this.wirePanel()
    this.placePicture()

    const pads = this.world.input.xr.gamepads
    const grips: Partial<Record<Hand, Vector3>> = {}
    const stick = { x: 0, y: 0 }
    for (const h of HANDS) {
      const pad = pads[h]
      if (!pad) continue
      const grip = player.gripSpaces[h].getWorldPosition(new Vector3())
      const squeezed = pad.getButtonPressed(InputComponent.Squeeze)
      if (pad.getButtonDown(InputComponent.Squeeze) && !this.picture.heldBy) {
        const ray = player.raySpaces[h]
        const origin = ray.getWorldPosition(new Vector3())
        if (this.picture.reaches(grip, origin, ray.getWorldDirection(new Vector3()).negate()))
          this.picture.grab(h, this.world.scene)
      }
      if (this.picture.heldBy === h && !squeezed) this.picture.release(this.panel.object3D!)
      if (squeezed && this.picture.heldBy !== h) grips[h] = grip
      const s = pad.getAxesValues(InputComponent.Thumbstick)
      stick.x += s?.x ?? 0
      stick.y += s?.y ?? 0
    }
    this.globe.update(dt, grips, stick)
    const head = player.head.getWorldPosition(new Vector3())
    const holder = this.picture.heldBy
    if (holder) this.picture.hold(player.gripSpaces[holder].getWorldPosition(new Vector3()), head)
    const zoomed = this.globe.scale >= DETAIL_SCALE
    this.detail.update(now, this.globe.nearest(head), zoomed ? (DETAIL_HALF_M * 6371) / this.globe.radius : undefined)
    this.answer.update(this.globe.scale)

    const round = this.round
    if (round && this.paintDirty && now - this.lastPaintDraw >= PAINT_REDRAW_S) {
      const paint = round.paint.layer.toGeoJSON()
      this.globe.showPaint(paintGeometry(paint, THEME, PAINT_RADIUS))
      this.shownPaintCells = paint.features.length
      this.paintDirty = false
      this.lastPaintDraw = now
    }
    if (this.view.kind !== "paint" || !round) {
      for (const h of HANDS) this.cans[h].hide()
      return
    }

    if (pads.right?.getButtonDown(InputComponent.A_Button) || pads.left?.getButtonDown(InputComponent.X_Button))
      this.setTool(this.tool === "paint" ? "erase" : "paint")

    // The trigger also presses the menu's buttons; pointing at it, it sprays nothing.
    const onMenu = this.panel.hasComponent(Hovered)
    const triggers = HANDS.map((h) => pads[h]?.getButtonValue(InputComponent.Trigger) ?? 0)
    const wants =
      !onMenu &&
      round.paint.enabled.value &&
      HANDS.some((h, i) => triggers[i]! > TRIGGER_DEAD && this.cans[h].aim(this.globe) !== undefined)
    if (wants && !this.stroking) {
      round.paint.beginOutsideStroke(this.tool)
      this.stroking = true
    }
    // Every can updates, even once one has sprayed: each moves its own spot.
    const sprayed = HANDS.map((h, i) =>
      this.cans[h].update(now, this.globe, triggers[i]!, onMenu, this.tool, round.paint, pads[h]?.gamepad)
    )
    // Not left to paint.version: that moves on a window animation frame, and a
    // standalone headset runs none of those while it shows the session.
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
    const on = (id: string, f: () => void) => doc.requireElementById(id).addEventListener("click", f)
    on("paint", () => this.setTool("paint"))
    on("erase", () => this.setTool("erase"))
    on("undo", () => {
      this.round?.paint.undo()
      this.paintDirty = true
    })
    on("done", () => {
      const round = this.round
      if (this.view?.kind === "paint" && round && !round.paint.isEmpty.value) round.submit()
    })
    const next = () => this.view?.kind === "reveal" && this.view.reveal.next()
    on("next", next)
    on("finish", next)
    on("again", () => this.view?.kind === "done" && this.view.summary.again())
    on("exit", () => this.exit())
    this.setTool(this.tool)
    this.applyView()
  }

  private setTool(tool: SprayTool): void {
    this.tool = tool
    for (const h of HANDS) this.cans[h].setTool(tool)
    this.panelDoc?.getElementById("paint")?.setProperties({ variant: tool === "paint" ? "primary" : "secondary" })
    this.panelDoc?.getElementById("erase")?.setProperties({ variant: tool === "erase" ? "primary" : "secondary" })
  }

  private applyView(): void {
    const doc = this.panelDoc
    const view = this.view
    if (!doc || !view) return
    const show = (id: string, on: boolean) => doc.getElementById(id)?.setProperties({ display: on ? "flex" : "none" })
    const text = (id: string, t: string) => doc.getElementById(id)?.setProperties({ text: t })
    const reveal = view.kind === "reveal" ? view.reveal : undefined
    const summary = view.kind === "done" ? view.summary : undefined
    show("tools", view.kind === "paint")
    show("hint", view.kind === "paint")
    show("done", view.kind === "paint")
    show("score", view.kind !== "paint")
    show("next", reveal !== undefined && !reveal.last)
    show("finish", reveal?.last ?? false)
    show("again", summary !== undefined)
    if (view.kind === "paint") text("prompt", view.round.prompt)
    if (reveal) {
      text("prompt", reveal.label)
      // The menu's font has no middle dot.
      text("score", `${pts(reveal.score)} this round, ${pts(reveal.total)} in all`)
    }
    if (summary) {
      text("prompt", "Final score")
      text("score", `${pts(summary.total)} out of ${summary.max.toLocaleString()}`)
    }
  }
}

const pts = (n: number) => `${Math.round(n).toLocaleString()} pts`

declare global {
  interface Window {
    whereaboutsVr: Vr
  }
}
