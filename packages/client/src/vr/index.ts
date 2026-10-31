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
  InputComponent,
  ReferenceSpaceType,
  SessionMode,
  Vector3,
  VisibilityState,
  World
} from "@iwsdk/core"
import { effect, signal } from "@preact/signals"
import { describeHint } from "@whereabouts/shared/hints"
import type { BordersData } from "@whereabouts/shared/borders"
import type { LandMaskData } from "@whereabouts/shared/land"
import { headsetPassthrough } from "../settings"
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
import { FlagPins, type Pointer } from "./flag-pins"
import { AnswerMarker } from "./answer"
import { DetailPatch } from "./detail-patch"
import { drawBorders, drawColour, drawLand } from "./globe-texture"
import { fetchBuildJson } from "../stale-build"
import landUrl from "@whereabouts/shared/land.json?url"
import bordersUrl from "@whereabouts/shared/borders.json?url"
import { paintGeometry } from "./paint-mesh"
import { Picture } from "./picture"
import { HintMarker } from "./hint"
import { reflect, reflections } from "./models"
import { timerFrames } from "./frames"
import { HandTool, TRIGGER_DEAD, type SprayTool } from "./spray"
import { Moon } from "./moon"
import { STARS_M, Space } from "./space"
import { SCORES_M, ScoreBoard } from "./scores"
import { ResultsBoard } from "./board"
import { WristMenu, type WristButton } from "./wrist"
import { Menu, PANEL_M } from "./menu"
import { colouredPaint, framing } from "./reveal"
import { PanelClearance } from "./clearance"
import { wristActions } from "./wrist-actions"
import { VrProbe } from "./probe"
import type { VrRound, VrView } from "./view"

/**
 * IWSDK updates and draws its scene every frame from the start, on the page
 * too, where nobody sees it: twice the page's drawing, on a headset's
 * browser. Its loop calls these by name each frame, so they can wait.
 */
function idleOffHeadset(world: World): void {
  const update = world.update.bind(world)
  world.update = (delta, time) => {
    if (world.session) update(delta, time)
  }
  const renderer = world.renderer
  const render = renderer.render.bind(renderer)
  renderer.render = (scene, camera) => {
    if (world.session) render(scene, camera)
  }
}

const HANDS = ["left", "right"] as const
/** Rebuilding the paint is the costly part of a stroke, so at most this often. */
const PAINT_REDRAW_S = 0.1
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

  /** What the browser tests read of the scene. */
  readonly probe: VrProbe
  private view: VrView | undefined = undefined
  private pictureKey = ""
  private paintsKey = ""
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
  /**
   * Ending one kind of session to start the other: the passthrough wanted,
   * saved only once its session opens, and whether that session has been asked for.
   */
  private switchingTo: boolean | undefined = undefined
  private switchOpening = false
  private readonly clearance = new PanelClearance()
  private readonly tools: Record<Hand, HandTool>
  private readonly menu: Menu

  static async create(onStage: (stage: "headset" | "land") => void): Promise<Vr> {
    onStage("headset")
    // WebGL needs somewhere to put its canvas; in the headset nobody sees the page.
    const host = document.createElement("div")
    host.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none"
    document.body.append(host)
    let world: World | undefined = undefined
    let vr: Vr | undefined = undefined
    try {
      world = await World.create(host, {
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
      idleOffHeadset(world)
      vr = new Vr(world)
      onStage("land")
      // Drawn now, while the page says it is loading, so the pause never comes in the headset.
      const [land, borders] = await Promise.all([
        fetchBuildJson<LandMaskData>(landUrl),
        fetchBuildJson<BordersData>(bordersUrl)
      ])
      // The drawing holds the page up for a second: let it show the stage first.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
      const landOnly = drawLand(vr.globe.landCanvas, land, THEME)
      const renderer = world.renderer
      vr.globe.landDrawn(renderer)
      drawBorders(vr.globe.bordersCanvas, borders, THEME)
      vr.globe.bordersDrawn(renderer)
      // Not needed until the first answer, and it waits on the network.
      const globe = vr.globe
      drawColour(globe.colourCanvas, globe.landCanvas, landOnly).then(
        () => globe.colourDrawn(renderer),
        (err: unknown) => console.warn("could not colour the VR globe", err)
      )
      window.whereaboutsVr = vr
      return vr
    } catch (err) {
      // A page holds only so many WebGL contexts; the next try makes its own.
      vr?.detail.dispose()
      world?.destroy()
      world?.renderer.dispose()
      world?.renderer.forceContextLoss()
      host.remove()
      throw err
    }
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

    this.menu = new Menu(world, {
      clicked: () => this.clicks++,
      done: () => this.painting?.done(),
      togglePassthrough: () => this.togglePassthrough(),
      exit: () => this.exit()
    })
    this.menu.object3D.add(this.picture.mesh)
    const actions = wristActions({
      painting: () => this.painting,
      tools: this.tools,
      note: (text) => this.wrist.note(text),
      repaint: () => {
        this.paintDirty = true
      }
    })
    this.wrist = new WristMenu(
      world,
      Object.fromEntries(
        Object.entries(actions).map(([id, f]) => [
          id,
          () => {
            this.clicks++
            f()
          }
        ])
      ) as Record<WristButton, () => void>
    )
    this.scores = new ScoreBoard(world, () => this.clicks++)
    world.scene.add(this.board.mesh)
    this.probe = new VrProbe({
      world,
      view: () => this.view,
      globe: this.globe,
      detail: this.detail,
      picture: this.picture,
      hint: this.hint,
      wrist: this.wrist,
      scores: this.scores,
      board: this.board,
      flagPins: this.flagPins,
      space: this.space,
      moon: this.moon,
      menu: this.menu,
      clearance: this.clearance,
      tools: this.tools
    })

    void navigator.xr?.isSessionSupported(SessionMode.ImmersiveAR).then((ok) => this.menu.offerPassthrough(ok))
    world.visibilityState.subscribe((state) => {
      const active = state !== VisibilityState.NonImmersive
      if (!active && this.switchingTo !== undefined && !this.switchOpening) {
        // Still within the press's activation, which a new session needs.
        this.switchOpening = true
        this.launch(this.switchingTo)
        // Refused, it leaves the player on the page.
        setTimeout(() => {
          if (this.world.visibilityState.value === VisibilityState.NonImmersive) this.ended()
        }, SWITCH_MS)
        return
      }
      if (active && this.switchingTo !== undefined) {
        headsetPassthrough.value = this.switchingTo
        this.switchingTo = undefined
        this.switchOpening = false
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

  private launch(passthrough = headsetPassthrough.value): void {
    this.space.group.visible = this.moon.mesh.visible = !passthrough
    this.world.launchXR({ sessionMode: passthrough ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR })
  }

  /** Swaps space for the room round the player, or back: a new session of the other kind. */
  private togglePassthrough(): void {
    if (this.switchingTo !== undefined) return
    this.switchingTo = !headsetPassthrough.value
    this.world.exitXR()
  }

  /** Change what the headset shows, as the screen moves from round to answer to round. */
  show(view: VrView): void {
    this.endStroke()
    this.picture.release(this.menu.object3D)
    const leavingAnswer = this.view?.kind === "reveal" && view.kind !== "reveal"
    this.menu.show(view)
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
    } else if (leavingAnswer && this.placed) this.globe.zoomOut()
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
    this.scores.show(
      view.kind === "reveal" ? view.reveal.table : "summary" in view ? view.summary.table : view.round.table
    )
    // Players' colours tell them apart, so they tell whose paint is shown.
    const paintsKey = view.kind === "reveal" ? (view.reveal.paints?.map((p) => p.colour).join() ?? "own") : ""
    if (paintsKey !== this.paintsKey) {
      this.paintsKey = paintsKey
      this.paintDirty = true
    }
    this.board.show("summary" in view ? view.summary.board : undefined)
    const flags = view.kind === "reveal" ? view.reveal.flags : undefined
    this.flagPins.show(flags?.on ? flags.pins : undefined)
    this.menu.refresh(view)
  }

  private get round(): VrRound | undefined {
    return this.view && "round" in this.view ? this.view.round : undefined
  }

  /** The round, while this player may paint it. */
  private get painting(): VrRound | undefined {
    const round = this.round
    return this.view?.kind === "paint" && round?.playing && round.paint.enabled.value ? round : undefined
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

  exit(): void {
    if (this.active.value) this.world.exitXR()
  }

  private ended(): void {
    // A refused switch keeps the old setting.
    this.switchingTo = undefined
    this.switchOpening = false
    if (!this.active.value) return
    timerFrames(false)
    this.active.value = false
    this.leave()
  }

  private leave(): void {
    this.menu.leave()
    this.endStroke()
    this.picture.release(this.menu.object3D)
    this.stopPaintWatch?.()
    this.stopPaintWatch = undefined
    this.view = undefined
  }

  private frame(dt: number, now: number): void {
    this.frames++
    this.menu.tick(now)
    this.showControllers(this.painting === undefined)
    if (!this.view) return
    const { player } = this.world
    if (!this.placed) {
      const head = player.head.getWorldPosition(new Vector3())
      const forward = player.head.getWorldDirection(new Vector3()).negate()
      this.globe.place(head, forward)
      this.menu.place(head, forward)
      this.scores.place(head, forward)
      this.board.place(head, forward)
      this.clearance.placed(head, [
        { obj: this.menu.object3D, half: PANEL_M / 2 },
        { obj: this.scores.object3D, half: SCORES_M / 2 }
      ])
      this.placed = true
    }
    this.clearance.update(this.globe)
    this.menu.wirePanel()
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
      if (this.picture.heldBy === h && !squeezed) this.picture.release(this.menu.object3D)
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
    this.menu.updateLabels()
    if (!this.painting || !round) {
      for (const h of HANDS) {
        this.tools[h].hide()
        this.tools[h].settle(now)
      }
      return
    }

    // A steps through the right hand's tools, X the left's: Fill too on a country round.
    const fillable = round.paint.fillable.value
    const order: SprayTool[] = fillable ? ["paint", "erase", "fill"] : ["paint", "erase"]
    for (const [h, button] of [
      ["right", InputComponent.A_Button],
      ["left", InputComponent.X_Button]
    ] as const) {
      const tool = this.tools[h]
      if (!fillable && tool.tool === "fill") tool.setTool(h === "left" ? "erase" : "paint")
      if (pads[h]?.getButtonDown(button)) tool.setTool(order[(order.indexOf(tool.tool) + 1) % order.length]!)
    }

    // The trigger also presses the menu's buttons; pointing at it, it sprays nothing.
    const onMenu = this.menu.hovered || this.wrist.hovered
    // The left hand is turned to show the wrist menu, not to erase.
    const triggers = HANDS.map((h) =>
      h === "left" && this.wrist.open ? 0 : (pads[h]?.getButtonValue(InputComponent.Trigger) ?? 0)
    )
    const working = onMenu
      ? undefined
      : HANDS.find(
          (h, i) =>
            this.tools[h].touching(this.globe) !== undefined ||
            (!this.tools[h].busy &&
              this.tools[h].tool !== "fill" &&
              triggers[i]! > TRIGGER_DEAD &&
              this.tools[h].aim(this.globe) !== undefined)
        )
    const workingTool = working && this.tools[working].tool
    if (workingTool && workingTool !== "fill" && !this.stroking) {
      // Both hands make one undo step; the first sets the stroke's sound.
      round.paint.beginStroke(workingTool)
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
    this.round?.paint.endStroke()
    this.stroking = false
  }

  /** On top of the menu, which grows and shrinks with its text. */
  private placePicture(): void {
    const size = this.menu.size
    if (!size || this.picture.heldBy) return
    // The menu is scaled to fit a PANEL_M square, whatever its own units.
    const top = (size.height * Math.min(PANEL_M / size.width, PANEL_M / size.height)) / 2
    this.picture.mesh.position.set(0, top + 0.015 + this.picture.height / 2, 0)
  }
}

declare global {
  interface Window {
    whereaboutsVr: Vr
  }
}
