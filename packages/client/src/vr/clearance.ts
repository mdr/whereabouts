/** Keeping the panels beside the globe as the player sees it, however far it is zoomed. */
import { Vector3, type Object3D } from "three"

/** The gap a panel keeps from the globe, in radians as seen from the player. */
const PANEL_CLEAR = 0.04
const UP = new Vector3(0, 1, 0)

interface Seen {
  centre: Vector3
  radius: number
}

export class PanelClearance {
  /** Where the panels were placed, and from where. */
  private homes: { obj: Object3D; at: Vector3; half: number }[] = []
  private readonly eye = new Vector3()

  /** The panels just placed, seen from `eye`; `half` is half a panel's width. */
  placed(eye: Vector3, panels: { obj: Object3D; half: number }[]): void {
    this.eye.copy(eye)
    this.homes = panels.map(({ obj, half }) => ({ obj, at: obj.position.clone(), half }))
  }

  /**
   * Swings each panel round the player, from where it was placed, until it
   * clears the globe as seen from there: zooming in pushes them aside.
   */
  update(globe: Seen): void {
    const eye = this.eye
    const yaw = (p: Vector3) => Math.atan2(p.x - eye.x, p.z - eye.z)
    const flat = (p: Vector3) => Math.hypot(p.x - eye.x, p.z - eye.z)
    const centre = globe.centre
    const globeHalf = Math.asin(Math.min(1, globe.radius / Math.max(1e-6, flat(centre))))
    const globeYaw = yaw(centre)
    for (const { obj, at, half } of this.homes) {
      const offset = Math.atan2(Math.sin(yaw(at) - globeYaw), Math.cos(yaw(at) - globeYaw))
      const need = globeHalf + Math.atan(half / flat(at)) + PANEL_CLEAR
      const by = Math.abs(offset) >= need ? 0 : Math.sign(offset || 1) * need - offset
      obj.position.copy(at).sub(eye).applyAxisAngle(UP, by).add(eye)
      obj.lookAt(eye)
    }
  }

  /** The narrowest gap, in radians as the player sees it, between a panel and the globe. */
  gap(globe: Seen): number {
    const eye = this.eye
    const yaw = (p: Vector3) => Math.atan2(p.x - eye.x, p.z - eye.z)
    const flat = (p: Vector3) => Math.hypot(p.x - eye.x, p.z - eye.z)
    const centre = globe.centre
    const globeHalf = Math.asin(Math.min(1, globe.radius / flat(centre)))
    return Math.min(
      ...this.homes.map(({ obj, half }) => {
        const d = yaw(obj.position) - yaw(centre)
        return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) - globeHalf - Math.atan(half / flat(obj.position))
      })
    )
  }
}
