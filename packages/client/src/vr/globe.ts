/**
 * The globe in VR: land on a sphere and paint just above it, turned by
 * grabbing (the surface follows the hand, and a let-go keeps it turning),
 * zoomed with two hands or a thumbstick. It turns two ways only, as a
 * tilting desk globe does: spinning about its poles, and tilting about the
 * axis across the player's view, where its stand's pivots are. It never rolls.
 * Zooming grows it towards the far side, so the near surface stays where it
 * was rather than swallowing the player. Zoomed right in it is a gently
 * curved wall, a city across.
 */
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  type Object3D,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
  type WebGLRenderer
} from "three"

import type { LatLon } from "@whereabouts/shared"
import { latLonToLocal, localToLatLon } from "./sphere"
import { buildStand } from "./models"

export type Hand = "left" | "right"

const RADIUS = 0.22
/**
 * Just above the land, so neither fights it for depth; the paint on top.
 * However far it zooms, each stays the same real height above it.
 */
const BORDERS_RADIUS = RADIUS * 1.0005
export const DETAIL_RADIUS = RADIUS * 1.0015
export const HINT_RADIUS = RADIUS * 1.002
export const PAINT_RADIUS = RADIUS * 1.003
/** A pointed-at flag's country, over the paint. */
export const OUTLINE_RADIUS = RADIUS * 1.0035
export const ANSWER_RADIUS = RADIUS * 1.004
export const PIN_RADIUS = RADIUS * 1.001
const MIN_SCALE = 1
const MAX_SCALE = 200
/** How quickly a flung globe slows, per second. */
const SPIN_DECAY = 1.5
/** As far as it tilts either way: a pole faces the player. */
const MAX_TILT = Math.PI / 2
const STICK_DEAD = 0.15
/** How long the globe takes to turn a place to face the player. */
const TURN_S = 0.8
/** How wide, in metres, a place the globe turns to show is made. */
const FRAME_M = 0.35
/** The deepest the reveal zooms to frame the guesses: deeper swings the menus far aside. */
const MAX_FRAME_SCALE = 8

const UP = new Vector3(0, 1, 0)
const q = new Quaternion()
const v = new Vector3()
const w = new Vector3()

/** An angle the short way round, in (-π, π]. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** How the globe is turned: spun about its poles, then tilted. */
interface Turn {
  spin: number
  tilt: number
}

export class Globe {
  readonly group = new Group()
  /** What holds the globe up, on pivots at the ends of its tilt axis. It stays upright as the globe turns, and grows as it zooms. */
  readonly stand = new Group()
  readonly landCanvas = document.createElement("canvas")
  /** The land in natural colour, for the reveal. */
  readonly colourCanvas = document.createElement("canvas")
  readonly bordersCanvas = document.createElement("canvas")
  private readonly borders: Mesh<SphereGeometry, MeshBasicMaterial>
  private readonly landTexture: CanvasTexture
  private colourTexture: CanvasTexture | undefined = undefined
  private colourWanted = false
  private readonly surface: Mesh<SphereGeometry, MeshBasicMaterial>
  private readonly paint = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide })
  )
  /** The near surface point, which zooming leaves in place. */
  private readonly anchor = new Vector3()
  /** From the player towards the centre, level. */
  private readonly toward = new Vector3(0, 0, -1)
  /** Turned with the prime meridian facing the player, north up. */
  private readonly base = new Quaternion()
  private readonly turned: Turn = { spin: 0, tilt: 0 }
  /** Radians per second of each, while flung. */
  private readonly rate: Turn = { spin: 0, tilt: 0 }
  /** Each grabbing hand's last offset from the centre. */
  private readonly held: Partial<Record<Hand, Vector3>> = {}
  /** Two hands' gesture: how far apart they started, the zoom then, and the place between them. */
  private pair: { length: number; scale: number; spot: Vector3 } | undefined = undefined
  private turning: { from: Turn; to: Turn; scale: number; toScale: number; t: number } | undefined = undefined
  /** What sits just above the land, and how far above it at the smallest. */
  private readonly overlays: { obj: Object3D; radius: number }[] = []

  constructor(anisotropy: number) {
    this.landCanvas.width = 4096
    this.landCanvas.height = 2048
    this.landTexture = new CanvasTexture(this.landCanvas)
    this.landTexture.colorSpace = SRGBColorSpace
    this.landTexture.anisotropy = anisotropy
    this.colourCanvas.width = this.landCanvas.width
    this.colourCanvas.height = this.landCanvas.height
    this.surface = new Mesh(
      new SphereGeometry(RADIUS, 128, 64),
      // Pushed back, for the layers above to clear the flat facets the sphere is made of.
      new MeshBasicMaterial({ map: this.landTexture, polygonOffset: true, polygonOffsetFactor: 1 })
    )
    this.group.add(this.surface)
    this.bordersCanvas.width = this.landCanvas.width
    this.bordersCanvas.height = this.landCanvas.height
    const borders = new CanvasTexture(this.bordersCanvas)
    borders.colorSpace = SRGBColorSpace
    borders.anisotropy = anisotropy
    this.borders = new Mesh(
      new SphereGeometry(BORDERS_RADIUS, 128, 64),
      new MeshBasicMaterial({ map: borders, transparent: true, depthWrite: false })
    )
    this.borders.visible = false
    this.overlay(this.borders, BORDERS_RADIUS)
    this.paint.renderOrder = 2
    this.overlay(this.paint, PAINT_RADIUS)
    this.stand.add(buildStand(RADIUS))
  }

  get centre(): Vector3 {
    return this.group.position
  }

  get scale(): number {
    return this.group.scale.x
  }

  /** Whether it is turning to show a place. */
  get busy(): boolean {
    return this.turning !== undefined
  }

  get radius(): number {
    return RADIUS * this.scale
  }

  /** The place on the surface nearest `to`. */
  nearest(to: Vector3): LatLon {
    return localToLatLon(this.group.worldToLocal(v.copy(to)))
  }

  /** Adds `obj`, drawn at `radius` on the smallest globe, to sit that high above the land at any zoom. */
  overlay(obj: Object3D, radius: number): void {
    this.overlays.push({ obj, radius })
    this.group.add(obj)
  }

  /** Sends the land to the GPU straight away rather than on the first frame that shows it. */
  landDrawn(renderer: WebGLRenderer): void {
    this.landTexture.needsUpdate = true
    renderer.initTexture(this.landTexture)
  }

  bordersDrawn(renderer: WebGLRenderer): void {
    this.borders.material.map!.needsUpdate = true
    renderer.initTexture(this.borders.material.map!)
  }

  /** National borders, when the page's map would show them. */
  showBorders(on: boolean): void {
    this.borders.visible = on
  }

  get bordersShown(): boolean {
    return this.borders.visible
  }

  colourDrawn(renderer: WebGLRenderer): void {
    const texture = new CanvasTexture(this.colourCanvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = this.landTexture.anisotropy
    renderer.initTexture(texture)
    this.colourTexture = texture
    this.showColour(this.colourWanted)
  }

  /** Natural colour on the land, once it has loaded, or the plain land. */
  showColour(on: boolean): void {
    this.colourWanted = on
    this.surface.material.map = (on ? this.colourTexture : undefined) ?? this.landTexture
  }

  get colourShown(): boolean {
    return this.surface.material.map === this.colourTexture
  }

  showPaint(geometry: BufferGeometry): void {
    this.paint.geometry.dispose()
    this.paint.geometry = geometry
  }

  /** In front of the player at chest height, the size it starts at, the prime meridian facing them. */
  place(head: Vector3, forward: Vector3): void {
    this.toward.set(forward.x, 0, forward.z).normalize()
    this.anchor
      .copy(head)
      .addScaledVector(this.toward, 0.45)
      .add(v.set(0, -0.3, 0))
    this.base.setFromUnitVectors(v.set(1, 0, 0), w.copy(this.toward).negate())
    this.stand.quaternion.setFromUnitVectors(v.set(1, 0, 0), this.toward)
    this.turned.spin = this.turned.tilt = 0
    this.rate.spin = this.rate.tilt = 0
    this.turning = undefined
    this.orient()
    this.setScale(MIN_SCALE)
  }

  /**
   * Turn the globe until `at` faces `eye`, zoomed so a cap of `reach`
   * radians round it fits in view. Grabbing it or the thumbstick stops the turn.
   */
  turnToward(at: LatLon, reach: number, eye: Vector3): void {
    const toScale =
      reach >= Math.PI / 2
        ? MIN_SCALE
        : Math.min(MAX_FRAME_SCALE, Math.max(MIN_SCALE, FRAME_M / (RADIUS * Math.sin(Math.max(reach, 1e-4)))))
    // Spun until the place is straight ahead, then tilted to the eye, as
    // seen from where the centre will be once zoomed.
    const centre = w.copy(this.anchor).addScaledVector(this.toward, RADIUS * toScale)
    const place = this.angles(latLonToLocal(at).applyQuaternion(this.base), 0)
    // Spinning it straight ahead leaves its height: that is the tilt it starts from.
    const placeTilt = Math.asin(latLonToLocal(at).applyQuaternion(this.base).normalize().dot(UP))
    const eyeAt = this.angles(eye.clone().sub(centre), 0)
    const to = {
      spin: this.turned.spin + wrap(-place.spin - this.turned.spin),
      tilt: Math.max(-MAX_TILT, Math.min(MAX_TILT, eyeAt.tilt - placeTilt))
    }
    this.turning = { from: { ...this.turned }, to, scale: this.scale, toScale, t: 0 }
    this.rate.spin = this.rate.tilt = 0
  }

  /**
   * Where `offset` (from the centre, in the world) points, as the turns
   * that bring straight ahead round to it: the spin about the poles (undoing
   * `tilt` first) and the tilt.
   */
  private angles(offset: Vector3, tilt: number): Turn {
    const back = this.toward.clone().negate()
    const side = new Vector3().crossVectors(back, UP)
    const tilted = Math.atan2(offset.dot(UP), offset.dot(back))
    const flat = offset.clone().applyAxisAngle(side, -tilt)
    // A spin about up carries straight ahead (back) towards -side.
    return { spin: Math.atan2(-flat.dot(side), flat.dot(back)), tilt: tilted }
  }

  private turnBy(spin: number, tilt: number): void {
    this.turned.spin += spin
    this.turned.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, this.turned.tilt + tilt))
    this.orient()
  }

  private orient(): void {
    const side = w.crossVectors(v.copy(this.toward).negate(), UP)
    this.group.quaternion
      .setFromAxisAngle(side, this.turned.tilt)
      .multiply(q.setFromAxisAngle(UP, this.turned.spin))
      .multiply(this.base)
  }

  /** `grips`: where each hand holding the grip button is. `stick`: the thumbsticks, summed. */
  update(dt: number, grips: Partial<Record<Hand, Vector3>>, stick: { x: number; y: number }): void {
    const { left, right } = grips
    if (left || right || Math.abs(stick.x) > STICK_DEAD || Math.abs(stick.y) > STICK_DEAD) this.turning = undefined
    if (this.turning) {
      const { from, to } = this.turning
      const t = (this.turning.t = Math.min(1, this.turning.t + dt / TURN_S))
      const eased = t * t * (3 - 2 * t)
      this.turned.spin = from.spin + (to.spin - from.spin) * eased
      this.turned.tilt = from.tilt + (to.tilt - from.tilt) * eased
      this.orient()
      // Evenly in the logarithm, as the thumbstick zooms.
      const { scale, toScale } = this.turning
      this.setScale(scale * Math.pow(toScale / scale, eased))
      if (t === 1) this.turning = undefined
    }
    if (left && right) {
      // Two hands zoom, as a map pinches: the place between them stays between them.
      const apart = left.distanceTo(right)
      const mid = w.addVectors(left, right).multiplyScalar(0.5)
      if (this.pair) {
        this.setScale((this.pair.scale * apart) / this.pair.length)
        const was = this.angles(v.copy(this.pair.spot).applyQuaternion(this.group.quaternion), this.turned.tilt)
        const now = this.angles(mid.sub(this.centre), this.turned.tilt)
        this.turnBy(wrap(now.spin - was.spin), wrap(now.tilt - was.tilt))
      } else {
        const spot = this.group.worldToLocal(mid.clone()).normalize()
        this.pair = { length: apart, scale: this.group.scale.x, spot }
      }
      this.rate.spin = this.rate.tilt = 0
    } else {
      this.pair = undefined
      const hand: Hand | undefined = left ? "left" : right ? "right" : undefined
      const prev = hand && this.held[hand]
      if (hand && prev && dt > 0) {
        const was = this.angles(prev, this.turned.tilt)
        const now = this.angles(v.copy(grips[hand]!).sub(this.centre), this.turned.tilt)
        const spin = wrap(now.spin - was.spin)
        const tilt = wrap(now.tilt - was.tilt)
        this.turnBy(spin, tilt)
        this.rate.spin += (spin / dt - this.rate.spin) * 0.5
        this.rate.tilt += (tilt / dt - this.rate.tilt) * 0.5
      } else if (!hand && Math.abs(this.rate.spin) + Math.abs(this.rate.tilt) > 1e-3) {
        this.turnBy(this.rate.spin * dt, this.rate.tilt * dt)
        const decay = Math.exp(-SPIN_DECAY * dt)
        this.rate.spin *= decay
        this.rate.tilt *= decay
      }
    }
    for (const h of ["left", "right"] as const) {
      const p = grips[h]
      this.held[h] = p ? (this.held[h] ?? new Vector3()).copy(p).sub(this.centre) : undefined
    }

    if (Math.abs(stick.x) > STICK_DEAD) this.turnBy(stick.x * 1.5 * dt, 0)
    if (Math.abs(stick.y) > STICK_DEAD) this.setScale(this.group.scale.x * Math.exp(-stick.y * 1.2 * dt))
  }

  private setScale(s: number): void {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
    this.group.scale.setScalar(scale)
    this.group.position.copy(this.anchor).addScaledVector(this.toward, RADIUS * scale)
    this.stand.scale.setScalar(scale)
    this.stand.position.copy(this.group.position)
    for (const { obj, radius } of this.overlays) obj.scale.setScalar((RADIUS + (radius - RADIUS) / scale) / radius)
    // The facets' sag grows with the globe; the layers' height above them doesn't.
    this.surface.material.polygonOffsetUnits = 64 * scale
  }
}
