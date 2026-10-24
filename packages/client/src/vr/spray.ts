/**
 * A tool in each hand: a spray can, or an eraser. The trigger works along
 * the controller's ray, as hard as it is pulled; the nearer the hand to the
 * globe, the smaller and denser the spot, like real spray paint. A ring on
 * the globe shows where the spot would land before anything happens.
 */
import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Object3D } from "three"
import { greatCircleDistance, type LatLon } from "@whereabouts/shared"
import type { PaintController } from "../paint-controller"
import type { Theme } from "../themes"
import type { Globe } from "./globe"
import { buildCan, buildEraser } from "./models"
import { SprayParticles } from "./particles"
import { localToLatLon, raySphere } from "./sphere"

export type SprayTool = "paint" | "erase"

const EARTH_KM = 6371
/** Half the spray cone's angle: the spot's radius is this much of the can's distance. */
const SPREAD = Math.tan((9 * Math.PI) / 180)
const MIN_KM = 5
const MAX_KM = 3000
/** Held still, the spray keeps adding paint this often. */
const STILL_STAMP_S = 0.15
/** Nearer than this, paint goes on at full strength; it thins with distance beyond. */
const FULL_STRENGTH_M = 0.3
export const TRIGGER_DEAD = 0.05

const origin = new Vector3()
const dir = new Vector3()
const hit = new Vector3()
const normal = new Vector3()
const local = new Vector3()

interface Pulsing {
  pulse?(intensity: number, ms: number): Promise<boolean>
}

export class HandTool {
  private readonly can = new Group()
  private readonly eraser = new Group()
  private readonly spot: Mesh<RingGeometry, MeshBasicMaterial>
  private readonly particles = new SprayParticles()
  /** The paint's colour, when a player has one of their own. */
  private colour: string | undefined = undefined
  private lastNow: number | undefined = undefined
  private readonly ray: Object3D
  private readonly theme: Theme
  private stroke: { at: LatLon; t: number } | undefined = undefined
  private lastPulse = 0
  private toolNow: SprayTool = "paint"

  constructor(grip: Object3D, ray: Object3D, scene: Object3D, theme: Theme) {
    this.ray = ray
    this.theme = theme
    this.can.add(buildCan(theme.ramp[1]))
    this.eraser.add(buildEraser())
    grip.add(this.can, this.eraser)

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
    this.can.visible = tool === "paint"
    this.eraser.visible = tool === "erase"
    this.spot.material.color.set(tool === "erase" ? this.theme.answer : this.theme.brush)
  }

  /** Moves the droplets already in the air on; returns the seconds since last time. */
  settle(now: number): number {
    const dt = this.lastNow === undefined ? 0 : Math.min(0.1, now - this.lastNow)
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
  aim(globe: Globe): number | undefined {
    this.ray.getWorldPosition(origin)
    this.ray.getWorldDirection(dir).negate()
    return raySphere(origin, dir, globe.centre, globe.radius)
  }

  /**
   * `trigger` 0 to 1; `blocked` when the ray is on the menu instead. Returns
   * whether it sprayed, for the caller to track the stroke across both hands.
   */
  update(
    now: number,
    globe: Globe,
    trigger: number,
    blocked: boolean,
    paint: PaintController,
    gamepad: Gamepad | undefined
  ): boolean {
    const dt = this.settle(now)
    const d = blocked ? undefined : this.aim(globe)
    if (d === undefined) {
      this.hide()
      return false
    }
    hit.copy(origin).addScaledVector(dir, d)
    normal.copy(hit).sub(globe.centre).normalize()
    const spotM = d * SPREAD
    this.spot.visible = true
    this.spot.position.copy(hit).addScaledVector(normal, 0.002)
    this.spot.lookAt(local.copy(hit).add(normal))
    this.spot.scale.setScalar(spotM)

    const spraying = paint.enabled.value && trigger > TRIGGER_DEAD
    if (!spraying) {
      this.stroke = undefined
      return false
    }
    if (this.toolNow === "paint")
      this.particles.spray(dt, 700 * trigger, origin, hit, spotM, this.colour ?? this.theme.ramp[2])
    else this.particles.crumbs(dt, 90 * trigger, hit, normal, spotM)

    const radiusKm = Math.min(MAX_KM, Math.max(MIN_KM, (spotM / globe.radius) * EARTH_KM))
    const at = localToLatLon(globe.group.worldToLocal(local.copy(hit)))
    const last = this.stroke
    if (!last || greatCircleDistance(last.at, at) >= radiusKm / 4 || now - last.t >= STILL_STAMP_S) {
      const thin = Math.min(1, FULL_STRENGTH_M / d)
      // Stamps overlap along a stroke, so each is a fraction, as on the map.
      paint.stampOutside(at, radiusKm, (this.toolNow === "erase" ? -1 : 1) * 0.3 * trigger * thin)
      this.stroke = { at, t: now }
    }
    if (now - this.lastPulse > 0.05) {
      const actuator = gamepad?.hapticActuators[0] as Pulsing | undefined
      void actuator?.pulse?.(0.1 + 0.5 * trigger * Math.min(1, FULL_STRENGTH_M / d), 80)
      this.lastPulse = now
    }
    return true
  }
}
