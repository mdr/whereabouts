/**
 * A tool in each hand: a spray can, an eraser, or on a country round a pail
 * that fills the country under the ray at a pull. The trigger works along
 * the controller's ray, as hard as it is pulled; the nearer the hand to the
 * globe, the smaller and denser the spot, like real spray paint. A ring on
 * the globe shows where the spot would land before anything happens. The
 * eraser also rubs out wherever its tip touches the globe.
 */
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Object3D
} from "three"
import { toRadians, type LatLon } from "@whereabouts/shared/geo"
import type { PaintController } from "../../paint/paint-controller"
import type { Theme } from "../../map/themes"
import type { Globe } from "../globe/globe"
import { buildCan, buildEraser, buildPail } from "../hands/models"
import { SprayParticles } from "./particles"
import { localToLatLon, raySphere } from "../globe/sphere"
import { groundRadius, stampDue, type SprayTool } from "./spray-rules"
import { Tool } from "../../paint/tool"
import type { Metres, Ms, Seconds } from "@whereabouts/shared/units"

type Paintable = Pick<PaintController, "enabled" | "stamp" | "fillOutside">
type Target = Pick<Globe, "centre" | "radius" | "group">

/** Half the spray cone's angle: the spot's radius is this much of the can's distance. */
const SPREAD = Math.tan(toRadians(9))
/** Nearer than this, paint goes on at full strength; it thins with distance beyond. */
const FULL_STRENGTH_RANGE: Metres = 0.3
/** The eraser's tip, from the grip, and how wide a patch it rubs. */
const TIP = new Vector3(0, 0, -0.0625)
const TIP_SIZE: Metres = 0.012
/** How near the surface counts as touching it: the rubber gives a little. */
const TOUCH_GAP: Metres = 0.004
export const TRIGGER_DEAD = 0.05
/** How far a pointing ray reaches when it misses the globe. */
const BEAM_LENGTH: Metres = 1.5

const origin = new Vector3()
const dir = new Vector3()
const hit = new Vector3()
const normal = new Vector3()
const local = new Vector3()

interface Pulsing {
  pulse?(intensity: number, ms: Ms): Promise<boolean>
}

export class HandTool {
  private readonly can = new Group()
  private readonly eraser = new Group()
  private readonly pail = new Group()
  /** The trigger held since a fill, so one pull fills once. */
  private pulled = false
  private readonly spot: Mesh<RingGeometry, MeshBasicMaterial>
  private readonly particles = new SprayParticles()
  /** The paint's colour, when a player has one of their own. */
  private colour: string | undefined = undefined
  private lastNow: Seconds | undefined = undefined
  private readonly ray: Object3D
  private readonly grip: Object3D
  /** Whether the hand holds its tool: only while there is a round to paint. */
  private holding = true
  /** Gripping, to turn or zoom the globe or hold the picture: it paints and rubs out nothing. */
  busy = false
  /** A ray out to the globe, to point with, and a dot where it lands. */
  private readonly beam = new Line(
    new BufferGeometry().setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3)),
    new LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 })
  )
  private readonly beamEnd = new Mesh(new SphereGeometry(0.004, 12, 8), new MeshBasicMaterial({ color: "#ffffff" }))
  private readonly theme: Theme
  private stroke: { at: LatLon; t: Seconds } | undefined = undefined
  private lastPulse: Seconds = 0
  private toolNow: SprayTool = Tool.PAINT

  constructor(grip: Object3D, ray: Object3D, scene: Object3D, theme: Theme) {
    this.ray = ray
    this.grip = grip
    this.theme = theme
    this.can.add(buildCan(theme.ramp[1]))
    this.eraser.add(buildEraser())
    this.pail.add(buildPail(theme.ramp[1]))
    grip.add(this.can, this.eraser, this.pail)

    this.spot = new Mesh(
      new RingGeometry(0.85, 1, 48),
      new MeshBasicMaterial({
        color: theme.brush,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: DoubleSide
      })
    )
    this.spot.visible = false
    // After the globe's map and paint, which would otherwise cover it: neither writes depth.
    this.spot.renderOrder = 3
    scene.add(this.spot, this.particles.points)
    this.beam.visible = this.beamEnd.visible = false
    ray.add(this.beam)
    scene.add(this.beamEnd)
  }

  /** Where the ring shows on the globe, if it does. */
  get target(): Vector3 | undefined {
    return this.spot.visible ? this.spot.position : undefined
  }

  get tool(): SprayTool {
    return this.toolNow
  }

  setTool(tool: SprayTool): void {
    this.toolNow = tool
    this.spot.material.color.set(tool === Tool.ERASE ? this.theme.answer : this.theme.brush)
    this.hold(this.holding)
  }

  get held(): boolean {
    return this.can.visible || this.eraser.visible || this.pail.visible
  }

  /** Puts the tool in the hand, or away. */
  hold(on: boolean): void {
    this.holding = on
    this.can.visible = on && this.toolNow === Tool.PAINT
    this.eraser.visible = on && this.toolNow === Tool.ERASE
    this.pail.visible = on && this.toolNow === Tool.FILL
  }

  /** Moves the droplets already in the air on; returns the seconds since last time. */
  settle(now: Seconds): Seconds {
    const dt: Seconds = this.lastNow === undefined ? 0 : Math.min(0.1, now - this.lastNow)
    this.lastNow = now
    this.particles.update(dt)
    return dt
  }

  get particlesLive(): number {
    return this.particles.live
  }

  setColour(colour: string | undefined): void {
    this.colour = colour
  }

  hide(): void {
    this.spot.visible = false
    this.stroke = undefined
  }

  /** Where the ray meets the globe, if it does: distance from the can. */
  aim(globe: Target): number | undefined {
    this.ray.getWorldPosition(origin)
    this.ray.getWorldDirection(dir).negate()
    return raySphere(origin, dir, globe.centre, globe.radius)
  }

  /** The controller's ray, from the hand outwards. */
  pointer(): { origin: Vector3; dir: Vector3 } {
    return {
      origin: this.ray.getWorldPosition(new Vector3()),
      dir: this.ray.getWorldDirection(new Vector3()).negate()
    }
  }

  /** Shows the ray out to where it meets the globe, or a little way if it misses; or hides it. */
  showBeam(globe: Globe | undefined): void {
    this.beam.visible = this.beamEnd.visible = globe !== undefined
    if (!globe) return
    const d = this.aim(globe) ?? BEAM_LENGTH
    this.beam.scale.set(1, 1, d)
    this.beamEnd.position.copy(origin).addScaledVector(dir, d)
  }

  get beamShown(): boolean {
    return this.beam.visible
  }

  /** Where the eraser's tip touches the globe, if it is the tool held and it does. */
  touching(globe: Target): Vector3 | undefined {
    if (this.toolNow !== Tool.ERASE || !this.holding || this.busy) return undefined
    const tip = this.grip.localToWorld(local.copy(TIP))
    return tip.distanceTo(globe.centre) <= globe.radius + TOUCH_GAP ? tip : undefined
  }

  /**
   * `trigger` 0 to 1; `blocked` when the ray is on the menu instead. Returns
   * whether it sprayed, for the caller to track the stroke across both hands.
   */
  update(
    now: Seconds,
    globe: Target,
    trigger: number,
    blocked: boolean,
    paint: Paintable,
    gamepad: Gamepad | undefined
  ): boolean {
    const dt = this.settle(now)
    if (trigger <= TRIGGER_DEAD) this.pulled = false
    if (this.busy) {
      this.hide()
      return false
    }
    const tip = paint.enabled.value ? this.touching(globe) : undefined
    if (tip) return this.rub(now, globe, tip, paint, gamepad, dt)
    const d = blocked ? undefined : this.aim(globe)
    if (d === undefined) {
      this.hide()
      return false
    }
    hit.copy(origin).addScaledVector(dir, d)
    normal.copy(hit).sub(globe.centre).normalize()
    const spotSize = d * SPREAD
    this.spot.visible = true
    this.spot.position.copy(hit).addScaledVector(normal, 0.002)
    this.spot.lookAt(local.copy(hit).add(normal))
    this.spot.scale.setScalar(spotSize)

    const spraying = paint.enabled.value && trigger > TRIGGER_DEAD
    if (this.toolNow === Tool.FILL) {
      if (spraying && !this.pulled) {
        paint.fillOutside(
          localToLatLon(globe.group.worldToLocal(local.copy(hit))),
          groundRadius(spotSize, globe.radius)
        )
        this.pulse(now, 0.6, gamepad)
      }
      this.pulled = spraying
      return false
    }
    if (!spraying) {
      this.stroke = undefined
      return false
    }
    if (this.toolNow === Tool.PAINT)
      this.particles.spray(dt, 700 * trigger, origin, hit, spotSize, this.colour ?? this.theme.ramp[2])
    else this.particles.crumbs(dt, 90 * trigger, hit, normal, spotSize)

    const thin = Math.min(1, FULL_STRENGTH_RANGE / d)
    this.stamp(now, globe, hit, spotSize, (this.toolNow === Tool.ERASE ? -1 : 1) * 0.3 * trigger * thin, paint)
    this.pulse(now, 0.1 + 0.5 * trigger * thin, gamepad)
    return true
  }

  /** Rubs out under the eraser's tip, as hard as a full pull of the trigger. */
  private rub(
    now: Seconds,
    globe: Target,
    tip: Vector3,
    paint: Paintable,
    gamepad: Gamepad | undefined,
    dt: Seconds
  ): boolean {
    normal.copy(tip).sub(globe.centre).normalize()
    hit.copy(globe.centre).addScaledVector(normal, globe.radius)
    this.spot.visible = true
    this.spot.position.copy(hit).addScaledVector(normal, 0.002)
    this.spot.lookAt(local.copy(hit).add(normal))
    this.spot.scale.setScalar(TIP_SIZE)
    this.particles.crumbs(dt, 90, hit, normal, TIP_SIZE)
    this.stamp(now, globe, hit, TIP_SIZE, -0.3, paint)
    this.pulse(now, 0.4, gamepad)
    return true
  }

  /** Stamps overlap along a stroke, so each is a fraction, as on the map. */
  private stamp(now: Seconds, globe: Target, at3: Vector3, spotSize: Metres, strength: number, paint: Paintable): void {
    const radius = groundRadius(spotSize, globe.radius)
    const at = localToLatLon(globe.group.worldToLocal(local.copy(at3)))
    if (stampDue(this.stroke, at, radius, now)) {
      paint.stamp(at, radius, strength)
      this.stroke = { at, t: now }
    }
  }

  private pulse(now: Seconds, intensity: number, gamepad: Gamepad | undefined): void {
    if (now - this.lastPulse <= 0.05) return
    const actuator = gamepad?.hapticActuators[0] as Pulsing | undefined
    void actuator?.pulse?.(intensity, 80)
    this.lastPulse = now
  }
}
