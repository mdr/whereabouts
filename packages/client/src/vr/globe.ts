/**
 * The globe in VR: land on a sphere and paint just above it, spun by grabbing (the
 * surface follows the hand, and a let-go keeps it turning), zoomed with two
 * hands or a thumbstick. Zooming grows it towards the far side, so the near
 * surface stays where it was rather than swallowing the player.
 */
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Matrix4,
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

export type Hand = "left" | "right"

const RADIUS = 0.22
/** Just above the land, so neither fights it for depth; the paint on top. */
export const DETAIL_RADIUS = RADIUS * 1.0015
export const PAINT_RADIUS = RADIUS * 1.003
export const ANSWER_RADIUS = RADIUS * 1.004
const MIN_SCALE = 1
const MAX_SCALE = 12
/** How quickly a flung globe slows, per second. */
const SPIN_DECAY = 1.5
const STICK_DEAD = 0.15
/** How long the globe takes to turn a place to face the player. */
const TURN_S = 0.8

const q = new Quaternion()
const v = new Vector3()
const w = new Vector3()

export class Globe {
  readonly group = new Group()
  readonly landCanvas = document.createElement("canvas")
  private readonly landTexture: CanvasTexture
  private readonly paint = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide })
  )
  /** The near surface point, which zooming leaves in place. */
  private readonly anchor = new Vector3()
  /** From the player towards the centre, level. */
  private readonly toward = new Vector3(0, 0, -1)
  /** Angular velocity while flung: axis times radians per second. */
  private readonly spin = new Vector3()
  /** Each grabbing hand's last offset from the centre. */
  private readonly held: Partial<Record<Hand, Vector3>> = {}
  private pair: { from: Vector3; length: number; scale: number } | undefined = undefined
  private turning: { from: Quaternion; to: Quaternion; scale: number; t: number } | undefined = undefined

  constructor(anisotropy: number) {
    this.landCanvas.width = 4096
    this.landCanvas.height = 2048
    this.landTexture = new CanvasTexture(this.landCanvas)
    this.landTexture.colorSpace = SRGBColorSpace
    this.landTexture.anisotropy = anisotropy
    this.group.add(new Mesh(new SphereGeometry(RADIUS, 128, 64), new MeshBasicMaterial({ map: this.landTexture })))
    this.paint.renderOrder = 2
    this.group.add(this.paint)
  }

  get centre(): Vector3 {
    return this.group.position
  }

  get scale(): number {
    return this.group.scale.x
  }

  get radius(): number {
    return RADIUS * this.scale
  }

  /** The place on the surface nearest `to`. */
  nearest(to: Vector3): LatLon {
    return localToLatLon(this.group.worldToLocal(v.copy(to)))
  }

  add(detail: Object3D): void {
    detail.renderOrder = 1
    this.group.add(detail)
  }

  /** Sends the land to the GPU straight away rather than on the first frame that shows it. */
  landDrawn(renderer: WebGLRenderer): void {
    this.landTexture.needsUpdate = true
    renderer.initTexture(this.landTexture)
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
    this.group.quaternion.setFromUnitVectors(v.set(1, 0, 0), w.copy(this.toward).negate())
    this.spin.set(0, 0, 0)
    this.turning = undefined
    this.setScale(MIN_SCALE)
  }

  /**
   * Turn the globe until `at` faces `eye`, zooming all the way out so the
   * paint shows around it. Grabbing it or the thumbstick stops the turn.
   */
  turnToward(at: LatLon, eye: Vector3): void {
    // Towards the eye from where the centre will be once zoomed out, north as near up as it goes.
    const centre = w.copy(this.anchor).addScaledVector(this.toward, RADIUS * MIN_SCALE)
    const local = basis(latLonToLocal(at), new Vector3(0, 1, 0))
    const world = basis(eye.clone().sub(centre).normalize(), new Vector3(0, 1, 0))
    const to = new Quaternion().setFromRotationMatrix(world.multiply(local.transpose()))
    this.turning = { from: this.group.quaternion.clone(), to, scale: this.scale, t: 0 }
    this.spin.set(0, 0, 0)
  }

  /** `grips`: where each hand holding the grip button is. `stick`: the thumbsticks, summed. */
  update(dt: number, grips: Partial<Record<Hand, Vector3>>, stick: { x: number; y: number }): void {
    const { left, right } = grips
    if (left || right || Math.abs(stick.x) > STICK_DEAD || Math.abs(stick.y) > STICK_DEAD) this.turning = undefined
    if (this.turning) {
      const t = (this.turning.t = Math.min(1, this.turning.t + dt / TURN_S))
      const eased = t * t * (3 - 2 * t)
      this.group.quaternion.slerpQuaternions(this.turning.from, this.turning.to, eased)
      this.setScale(this.turning.scale + (MIN_SCALE - this.turning.scale) * eased)
      if (t === 1) this.turning = undefined
    }
    if (left && right) {
      const between = v.copy(right).sub(left)
      if (this.pair) {
        this.turn(q.setFromUnitVectors(w.copy(this.pair.from).normalize(), between.clone().normalize()))
        this.setScale((this.pair.scale * between.length()) / this.pair.length)
        this.pair.from.copy(between)
      } else this.pair = { from: between.clone(), length: between.length(), scale: this.group.scale.x }
      this.spin.set(0, 0, 0)
    } else {
      this.pair = undefined
      const hand: Hand | undefined = left ? "left" : right ? "right" : undefined
      const prev = hand && this.held[hand]
      if (hand && prev && dt > 0) {
        const now = v.copy(grips[hand]!).sub(this.centre).normalize()
        this.turn(q.setFromUnitVectors(prev.normalize(), now))
        const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)))
        const axis = w.set(q.x, q.y, q.z)
        // A hand held still has no axis to turn about, and must still slow the fling to nothing.
        const velocity =
          axis.lengthSq() > 1e-12 ? axis.normalize().multiplyScalar((Math.sign(q.w) * angle) / dt) : axis.set(0, 0, 0)
        this.spin.lerp(velocity, 0.5)
      } else if (!hand && this.spin.lengthSq() > 1e-6) {
        const rate = this.spin.length()
        this.turn(q.setFromAxisAngle(w.copy(this.spin).divideScalar(rate), rate * dt))
        this.spin.multiplyScalar(Math.exp(-SPIN_DECAY * dt))
      }
    }
    for (const h of ["left", "right"] as const) {
      const p = grips[h]
      this.held[h] = p ? (this.held[h] ?? new Vector3()).copy(p).sub(this.centre) : undefined
    }

    if (Math.abs(stick.x) > STICK_DEAD) this.turn(q.setFromAxisAngle(v.set(0, 1, 0), stick.x * 1.5 * dt))
    if (Math.abs(stick.y) > STICK_DEAD) this.setScale(this.group.scale.x * Math.exp(-stick.y * 1.2 * dt))
  }

  private turn(by: Quaternion): void {
    this.group.quaternion.premultiply(by)
  }

  private setScale(s: number): void {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
    this.group.scale.setScalar(scale)
    this.group.position.copy(this.anchor).addScaledVector(this.toward, RADIUS * scale)
  }
}

/** Axes with `out` first and `up` made square to it, as a rotation's columns. */
function basis(out: Vector3, up: Vector3): Matrix4 {
  const u = up.clone().addScaledVector(out, -up.dot(out))
  // At a pole, any up will do.
  if (u.lengthSq() < 1e-8) u.set(1, 0, 0).addScaledVector(out, -out.x)
  u.normalize()
  return new Matrix4().makeBasis(out, u, new Vector3().crossVectors(out, u))
}
