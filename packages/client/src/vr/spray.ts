/**
 * A spray can in each hand. The trigger sprays along the controller's ray,
 * as hard as it is pulled; the nearer the can to the globe, the smaller and
 * denser the spot, like real spray paint. A ring on the globe shows where
 * the spot would land before any paint goes on.
 */
import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Vector3,
  type Object3D
} from "three"
import { greatCircleDistance, type LatLon } from "@whereabouts/shared"
import type { PaintController } from "../paint-controller"
import type { Theme } from "../themes"
import type { Globe } from "./globe"
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

export class SprayCan {
  private readonly cap: MeshStandardMaterial
  private readonly spot: Mesh
  private readonly mist: Mesh
  private readonly ray: Object3D
  private readonly theme: Theme
  private stroke: { at: LatLon; t: number } | undefined = undefined
  private lastPulse = 0

  constructor(grip: Object3D, ray: Object3D, scene: Object3D, theme: Theme) {
    this.ray = ray
    this.theme = theme
    const can = new Group()
    const body = new CylinderGeometry(0.033, 0.033, 0.13, 24).rotateX(-Math.PI / 2)
    can.add(new Mesh(body, new MeshStandardMaterial({ color: "#9aa7b8", metalness: 0.6, roughness: 0.35 })))
    this.cap = new MeshStandardMaterial({ color: theme.ramp[1] })
    const cap = new Mesh(new CylinderGeometry(0.026, 0.03, 0.03, 24).rotateX(-Math.PI / 2), this.cap)
    cap.position.z = -0.08
    can.add(cap)
    grip.add(can)

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
    // The cone's tip at its origin, opening along +Z, one unit long and wide.
    const cone = new ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2)
    this.mist = new Mesh(
      cone,
      new MeshBasicMaterial({
        color: theme.ramp[2],
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: DoubleSide
      })
    )
    this.spot.visible = this.mist.visible = false
    // After the globe's map and paint, which would otherwise cover them: none of the three writes depth.
    this.spot.renderOrder = this.mist.renderOrder = 3
    scene.add(this.spot, this.mist)
  }

  setTool(tool: SprayTool): void {
    this.cap.color.set(tool === "erase" ? this.theme.answer : this.theme.ramp[1])
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
    tool: SprayTool,
    paint: PaintController,
    gamepad: Gamepad | undefined
  ): boolean {
    const d = blocked ? undefined : this.aim(globe)
    if (d === undefined) {
      this.spot.visible = this.mist.visible = false
      this.stroke = undefined
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
    this.mist.visible = spraying
    if (!spraying) {
      this.stroke = undefined
      return false
    }
    this.mist.position.copy(origin)
    this.mist.lookAt(hit)
    this.mist.scale.set(spotM, spotM, d)

    const radiusKm = Math.min(MAX_KM, Math.max(MIN_KM, (spotM / globe.radius) * EARTH_KM))
    const at = localToLatLon(globe.group.worldToLocal(local.copy(hit)))
    const last = this.stroke
    if (!last || greatCircleDistance(last.at, at) >= radiusKm / 4 || now - last.t >= STILL_STAMP_S) {
      const thin = Math.min(1, FULL_STRENGTH_M / d)
      // Stamps overlap along a stroke, so each is a fraction, as on the map.
      paint.stampOutside(at, radiusKm, (tool === "erase" ? -1 : 1) * 0.3 * trigger * thin)
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
