/** Keeping the panels beside the globe as the player sees it, however far it is zoomed. */
import { Vector3, type Object3D } from "three"
import type { Metres, Radians } from "@whereabouts/shared/units"

/** The gap a panel keeps from the globe, in radians as seen from the player. */
const PANEL_CLEAR: Radians = 0.04
const UP = new Vector3(0, 1, 0)

interface Seen {
  centre: Vector3
  radius: Metres
}

export class PanelClearance {
  /** Where the panels were placed, and from where. */
  private homes: { object: Object3D; at: Vector3; half: Metres }[] = []
  private readonly eye = new Vector3()

  /** The panels just placed, seen from `eye`; `half` is half a panel's width. */
  placed(eye: Vector3, panels: { object: Object3D; half: Metres }[]): void {
    this.eye.copy(eye)
    this.homes = panels.map(({ object, half }) => ({ object, at: object.position.clone(), half }))
  }

  /**
   * Swings each panel round the player, from where it was placed, until it
   * clears the globe as seen from there: zooming in pushes them aside.
   */
  update(globe: Seen): void {
    const eye = this.eye
    const yaw = (point: Vector3) => Math.atan2(point.x - eye.x, point.z - eye.z)
    const flat = (point: Vector3) => Math.hypot(point.x - eye.x, point.z - eye.z)
    const centre = globe.centre
    const globeHalf = Math.asin(Math.min(1, globe.radius / Math.max(1e-6, flat(centre))))
    const globeYaw = yaw(centre)
    for (const { object, at, half } of this.homes) {
      const offset = Math.atan2(Math.sin(yaw(at) - globeYaw), Math.cos(yaw(at) - globeYaw))
      const need = globeHalf + Math.atan(half / flat(at)) + PANEL_CLEAR
      const by = Math.abs(offset) >= need ? 0 : Math.sign(offset || 1) * need - offset
      object.position.copy(at).sub(eye).applyAxisAngle(UP, by).add(eye)
      object.lookAt(eye)
    }
  }

  /** The narrowest gap, in radians as the player sees it, between a panel and the globe. */
  gap(globe: Seen): Radians {
    const eye = this.eye
    const yaw = (point: Vector3) => Math.atan2(point.x - eye.x, point.z - eye.z)
    const flat = (point: Vector3) => Math.hypot(point.x - eye.x, point.z - eye.z)
    const centre = globe.centre
    const globeHalf = Math.asin(Math.min(1, globe.radius / flat(centre)))
    return Math.min(
      ...this.homes.map(({ object, half }) => {
        const delta = yaw(object.position) - yaw(centre)
        return (
          Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) - globeHalf - Math.atan(half / flat(object.position))
        )
      })
    )
  }
}
