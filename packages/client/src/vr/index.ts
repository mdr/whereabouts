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
  ReferenceSpaceType,
  SessionMode,
  Vector3,
  World
} from "@iwsdk/core"
import { effect, type Signal } from "@preact/signals"
import { EARTH_RADIUS } from "@whereabouts/shared/geo"
import { describeHint } from "@whereabouts/shared/hints"
import type { BordersData } from "@whereabouts/shared/borders"
import type { LandMaskData } from "@whereabouts/shared/paint/land"
import { THEME } from "../map/themes"
import {
  ANSWER_RADIUS,
  DETAIL_RADIUS,
  Globe,
  HINT_RADIUS,
  OUTLINE_RADIUS,
  PAINT_RADIUS,
  PIN_RADIUS
} from "./globe/globe"
import { Hand, XR_HAND } from "./hands/hand"
import { VrLoadStage } from "./vr-support"
import { FlagPins } from "./globe/flag-pins"
import { AnswerMarker } from "./globe/answer"
import { DetailPatch } from "./globe/detail-patch"
import { drawBorders, drawColour, drawLand } from "./globe/globe-texture"
import { fetchBuildJson } from "../net/stale-build"
import landUrl from "@whereabouts/shared/land.json?url"
import bordersUrl from "@whereabouts/shared/borders.json?url"
import { paintGeometry } from "./globe/paint-mesh"
import { Picture } from "./picture/picture"
import { HintMarker } from "./globe/hint"
import { reflect, reflections } from "./hands/models"
import { Hands } from "./hands/hands"
import { HeadsetSession } from "./session"
import { boardOf, flagPinsOf, globeDetail, patchDetail, paintsKey, tableOf } from "./shown"
import { Moon } from "./moon"
import { STARS_DISTANCE, Space } from "./space"
import { SCORES_WIDTH, ScoreBoard } from "./scores/scores"
import { ResultsBoard } from "./scores/board"
import { WristMenu } from "./wrist/wrist"
import type { WristButton } from "./wrist/wrist-button"
import { Menu, PANEL_SIZE } from "./menu/menu"
import { colouredPaint, framing } from "./reveal"
import { PanelClearance } from "./clearance"
import { wristActions } from "./wrist/wrist-actions"
import { VrProbe } from "./probe"
import { VrPaintsType, VrViewType, type VrRound, type VrView } from "./view/view"
import { showsBorders, showsTerrain } from "../map/shown-detail"
import type { Metres, Seconds } from "@whereabouts/shared/units"

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

/** Rebuilding the paint is the costly part of a stroke, so at most this often. */
const PAINT_REDRAW: Seconds = 0.1
/** From this zoom on, the page's map shows over the globe. */
const DETAIL_SCALE = 2
/** How far either side of the near point the map covers. */
const DETAIL_HALF: Metres = 0.6

export class Vr {
  readonly active: Signal<boolean>
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
  private placed = false
  private paintDirty = true
  private lastPaintDraw: Seconds = 0
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
  private readonly clearance = new PanelClearance()
  private readonly hands: Hands
  private readonly session: HeadsetSession
  private readonly menu: Menu

  static async create(onStage: (stage: VrLoadStage) => void): Promise<Vr> {
    onStage(VrLoadStage.HEADSET)
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
        render: { far: STARS_DISTANCE * 1.2 }
      })
      idleOffHeadset(world)
      vr = new Vr(world)
      onStage(VrLoadStage.LAND)
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
        (error: unknown) => console.warn("could not colour the VR globe", error)
      )
      window.whereaboutsVr = vr
      return vr
    } catch (error) {
      // A page holds only so many WebGL contexts; the next try makes its own.
      vr?.detail.dispose()
      world?.destroy()
      world?.renderer.dispose()
      world?.renderer.forceContextLoss()
      host.remove()
      throw error
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

    this.hands = new Hands(world, () => this.round?.paint)
    const { gripSpaces } = world.player
    const room = reflections(world.renderer)
    for (const object of [this.globe.stand, gripSpaces.left, gripSpaces.right]) reflect(object, room)

    this.menu = new Menu(world, {
      clicked: () => this.clicks++,
      done: () => this.painting?.done(),
      togglePassthrough: () => this.session.togglePassthrough(),
      exit: () => this.exit()
    })
    this.menu.object3D.add(this.picture.mesh)
    const actions = wristActions({
      painting: () => this.painting,
      tools: this.hands.tools,
      note: (text) => this.wrist.note(text),
      repaint: () => {
        this.paintDirty = true
      }
    })
    this.wrist = new WristMenu(
      world,
      Object.fromEntries(
        Object.entries(actions).map(([id, handler]) => [
          id,
          () => {
            this.clicks++
            handler()
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
      tools: this.hands.tools
    })

    void navigator.xr
      ?.isSessionSupported(SessionMode.ImmersiveAR)
      .then((supported) => this.menu.offerPassthrough(supported))
    this.session = new HeadsetSession(world, {
      launching: (passthrough) => {
        this.space.group.visible = this.moon.mesh.visible = !passthrough
      },
      ended: () => this.leave()
    })
    this.active = this.session.active
    world.onXRFrame((_frame, delta, time) => this.frame(delta, time))
  }

  /** Call from the click that asked for VR: the browser only opens a headset session in answer to one. */
  enter(view: VrView): void {
    this.placed = false
    this.show(view)
    this.session.launch()
  }

  /** Change what the headset shows, as the screen moves from round to answer to round. */
  show(view: VrView): void {
    this.hands.endStroke()
    this.picture.release(this.menu.object3D)
    const leavingAnswer = this.view?.type === VrViewType.REVEAL && view.type !== VrViewType.REVEAL
    this.menu.show(view)
    this.view = view
    const round = this.round
    const picture = round?.picture
    const key = picture ? JSON.stringify(picture) : ""
    if (key !== this.pictureKey) {
      this.pictureKey = key
      this.picture.show(picture)
    }
    this.answer.show(view.type === VrViewType.REVEAL ? view.reveal.answer : undefined)
    if (view.type === VrViewType.REVEAL && this.placed) {
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
    const detail = patchDetail(view)
    if (detail) this.detail.setDetail(detail)
    this.hint.show(round?.hint)
    this.detail.setHint(round?.hint)
    if (round) this.wrist.setState(round.water, round.hint && describeHint(round.hint), round.hintsLeft)
    this.hands.setColour(round?.colour)
    const shown = globeDetail(view)
    this.globe.showColour(shown !== undefined && showsTerrain(shown))
    this.globe.showBorders(shown !== undefined && showsBorders(shown))
    this.scores.show(tableOf(view))
    const key = paintsKey(view)
    if (key !== this.paintsKey) {
      this.paintsKey = key
      this.paintDirty = true
    }
    this.board.show(boardOf(view))
    this.flagPins.show(flagPinsOf(view))
    this.menu.refresh(view)
  }

  private get round(): VrRound | undefined {
    return this.view && "round" in this.view ? this.view.round : undefined
  }

  /** The round, while this player may paint it. */
  private get painting(): VrRound | undefined {
    const round = this.round
    return this.view?.type === VrViewType.PAINT && round?.playing && round.paint.enabled.value ? round : undefined
  }

  exit(): void {
    this.session.exit()
  }

  private leave(): void {
    this.menu.leave()
    this.hands.endStroke()
    this.picture.release(this.menu.object3D)
    this.stopPaintWatch?.()
    this.stopPaintWatch = undefined
    this.view = undefined
  }

  private frame(dt: Seconds, now: Seconds): void {
    this.frames++
    this.menu.tick(now)
    this.hands.showControllers(this.painting === undefined)
    if (!this.view) return
    if (!this.placed) this.placeScene()
    this.clearance.update(this.globe)
    this.menu.wirePanel()
    this.scores.update()
    this.placePicture()
    const { grips, stick } = this.hands.grip(this.picture, this.menu.object3D)
    this.globe.update(dt, grips, stick)
    const head = this.world.player.head.getWorldPosition(new Vector3())
    this.updateScenery(dt, now, head)
    this.updatePointing(head)
    this.wrist.update(this.painting !== undefined, this.world.player.gripSpaces[XR_HAND[Hand.LEFT]], head)
    this.hands.hold(this.painting !== undefined)

    const round = this.round
    if (round && this.paintDirty && now - this.lastPaintDraw >= PAINT_REDRAW) this.redrawPaint(round, now)
    this.menu.updateLabels()
    const painting = this.painting
    if (!painting) {
      this.hands.rest(now)
      return
    }
    // The trigger also presses the menu's buttons; pointing at it, it sprays nothing.
    const onMenu = this.menu.hovered || this.wrist.hovered
    if (this.hands.paint(now, this.globe, painting.paint, onMenu, this.wrist.open)) this.paintDirty = true
  }

  private placeScene(): void {
    const { player } = this.world
    const head = player.head.getWorldPosition(new Vector3())
    const forward = player.head.getWorldDirection(new Vector3()).negate()
    this.globe.place(head, forward)
    this.menu.place(head, forward)
    this.scores.place(head, forward)
    this.board.place(head, forward)
    this.clearance.placed(head, [
      { object: this.menu.object3D, half: PANEL_SIZE / 2 },
      { object: this.scores.object3D, half: SCORES_WIDTH / 2 }
    ])
    this.placed = true
  }

  private updateScenery(dt: Seconds, now: Seconds, head: Vector3): void {
    const zoomed = this.globe.scale >= DETAIL_SCALE
    this.detail.update(
      now,
      this.globe.nearest(head),
      zoomed ? (DETAIL_HALF * EARTH_RADIUS) / this.globe.radius : undefined
    )
    this.answer.update(this.globe.scale)
    this.space.update(head)
    this.moon.update(dt, this.globe.centre, this.globe.radius)
  }

  private updatePointing(head: Vector3): void {
    const pointing = this.view?.type === VrViewType.REVEAL && this.flagPins.shown > 0
    const pointers = this.hands.pointers(this.globe)
    this.flagPins.update(this.globe.scale, pointing ? pointers : [], head)
    this.hands.showBeams(pointing ? this.globe : undefined)
  }

  private redrawPaint(round: VrRound, now: Seconds): void {
    const shown = this.view?.type === VrViewType.REVEAL ? this.view.reveal.paints : undefined
    const paints = shown?.type === VrPaintsType.PLAYERS ? shown.paints : undefined
    const paint = paints ? colouredPaint(paints) : round.paint.layer.toGeoJSON()
    this.globe.showPaint(paintGeometry(paint, THEME, PAINT_RADIUS, paints ? undefined : round.colour))
    this.shownPaintCells = paint.features.length
    this.paintDirty = false
    this.lastPaintDraw = now
  }

  /** On top of the menu, which grows and shrinks with its text. */
  private placePicture(): void {
    const size = this.menu.size
    if (!size || this.picture.heldBy) return
    // The menu is scaled to fit a PANEL_SIZE square, whatever its own units.
    const top = (size.height * Math.min(PANEL_SIZE / size.width, PANEL_SIZE / size.height)) / 2
    this.picture.mesh.position.set(0, top + 0.015 + this.picture.height / 2, 0)
  }
}

declare global {
  interface Window {
    whereaboutsVr: Vr
  }
}
