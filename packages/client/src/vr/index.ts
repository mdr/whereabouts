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
import type { MapDetail } from "@whereabouts/shared"
import type { PaintController } from "../paint-controller"
import { THEME } from "../themes"
import { DETAIL_RADIUS, Globe, PAINT_RADIUS, type Hand } from "./globe"
import { DetailPatch } from "./detail-patch"
import { drawLand } from "./globe-texture"
import { paintGeometry } from "./paint-mesh"
import { SprayCan, TRIGGER_DEAD, type SprayTool } from "./spray"
import panelUrl from "./panel.uikitml?url"

export interface VrRound {
  paint: PaintController
  /** The question as the card words it. */
  prompt: string
  /** What the page's map shows while painting. */
  detail: MapDetail
  submit(): void
}

const HANDS = ["left", "right"] as const
/** Rebuilding the paint is the costly part of a stroke, so at most this often. */
const PAINT_REDRAW_S = 0.1
/** From this zoom on, the page's map shows over the globe. */
const DETAIL_SCALE = 2
/** How far either side of the near point the map covers. */
const DETAIL_HALF_M = 0.6

export class Vr {
  readonly active = signal(false)
  /** Cells of paint the globe last drew, for the browser tests. */
  shownPaintCells = 0
  private round: VrRound | undefined = undefined
  private tool: SprayTool = "paint"
  private stroking = false
  private placed = false
  private paintDirty = true
  private lastPaintDraw = 0
  private stopPaintWatch: (() => void) | undefined = undefined
  private readonly globe: Globe
  private readonly detail: DetailPatch
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

    const { gripSpaces, raySpaces } = world.player
    this.cans = {
      left: new SprayCan(gripSpaces.left, raySpaces.left, world.scene, THEME),
      right: new SprayCan(gripSpaces.right, raySpaces.right, world.scene, THEME)
    }

    this.panel = world.createTransformEntity(new Group(), { persistent: true })
    this.panel.addComponent(RayInteractable)
    this.panel.addComponent(PanelUI, { config: panelUrl })

    world.visibilityState.subscribe((state) => {
      const active = state !== VisibilityState.NonImmersive
      if (active === this.active.value) return
      this.active.value = active
      if (!active) this.leave()
    })
    world.onXRFrame((_frame, delta, time) => this.frame(delta, time))
  }

  /** Call from the click that asked for VR: the browser only opens a headset session in answer to one. */
  enter(round: VrRound): void {
    this.round = round
    this.placed = false
    this.setTool("paint")
    this.detail.setDetail(round.detail)
    this.setPrompt()
    this.paintDirty = true
    this.stopPaintWatch?.()
    this.stopPaintWatch = effect(() => {
      // oxlint-disable-next-line typescript/no-unused-expressions -- the read is the dependency
      round.paint.version.value
      this.paintDirty = true
    })
    this.world.launchXR()
  }

  /** Whether the page's map shows over the globe, for the browser tests. */
  get detailShown(): boolean {
    return this.detail.mesh.visible
  }

  exit(): void {
    if (this.active.value) this.world.exitXR()
  }

  private leave(): void {
    this.endStroke()
    this.stopPaintWatch?.()
    this.stopPaintWatch = undefined
    this.round = undefined
  }

  private frame(dt: number, now: number): void {
    const round = this.round
    if (!round) return
    const { player } = this.world
    if (!this.placed) {
      const head = player.head.getWorldPosition(new Vector3())
      const forward = player.head.getWorldDirection(new Vector3()).negate()
      this.globe.place(head, forward)
      this.placePanel(head, forward)
      this.placed = true
    }
    this.wirePanel()

    const pads = this.world.input.xr.gamepads
    const grips: Partial<Record<Hand, Vector3>> = {}
    const stick = { x: 0, y: 0 }
    for (const h of HANDS) {
      const pad = pads[h]
      if (!pad) continue
      if (pad.getButtonPressed(InputComponent.Squeeze)) grips[h] = player.gripSpaces[h].getWorldPosition(new Vector3())
      const s = pad.getAxesValues(InputComponent.Thumbstick)
      stick.x += s?.x ?? 0
      stick.y += s?.y ?? 0
    }
    this.globe.update(dt, grips, stick)
    const head = player.head.getWorldPosition(new Vector3())
    const zoomed = this.globe.scale >= DETAIL_SCALE
    this.detail.update(now, this.globe.nearest(head), zoomed ? (DETAIL_HALF_M * 6371) / this.globe.radius : undefined)

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

    if (this.paintDirty && now - this.lastPaintDraw >= PAINT_REDRAW_S) {
      const paint = round.paint.layer.toGeoJSON()
      this.globe.showPaint(paintGeometry(paint, THEME, PAINT_RADIUS))
      this.shownPaintCells = paint.features.length
      this.paintDirty = false
      this.lastPaintDraw = now
    }
  }

  private endStroke(): void {
    if (!this.stroking) return
    this.round?.paint.endOutsideStroke()
    this.stroking = false
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
    doc.setTargetDimensions(0.38, 0.38)
    const on = (id: string, f: () => void) => doc.requireElementById(id).addEventListener("click", f)
    on("paint", () => this.setTool("paint"))
    on("erase", () => this.setTool("erase"))
    on("undo", () => {
      this.round?.paint.undo()
      this.paintDirty = true
    })
    on("done", () => {
      const round = this.round
      if (!round || round.paint.isEmpty.value) return
      this.exit()
      round.submit()
    })
    on("exit", () => this.exit())
    this.setTool(this.tool)
    this.setPrompt()
  }

  private setTool(tool: SprayTool): void {
    this.tool = tool
    for (const h of HANDS) this.cans[h].setTool(tool)
    this.panelDoc?.getElementById("paint")?.setProperties({ variant: tool === "paint" ? "primary" : "secondary" })
    this.panelDoc?.getElementById("erase")?.setProperties({ variant: tool === "erase" ? "primary" : "secondary" })
  }

  private setPrompt(): void {
    if (this.round) this.panelDoc?.getElementById("prompt")?.setProperties({ text: this.round.prompt })
  }
}

declare global {
  interface Window {
    whereaboutsVr: Vr
  }
}
