/** A hint's band on the VR globe, shaded and edged as the page's map shades it. */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3
} from "three"
import type { HintBand } from "@whereabouts/shared"
import { latLonToLocal } from "./sphere"

const RAD = Math.PI / 180
const STEPS = 180

export class HintMarker {
  readonly group = new Group()
  private readonly radius: number
  private readonly fill = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false })
  private readonly edge = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
  private shown: HintBand | undefined = undefined

  constructor(radius: number) {
    this.radius = radius
  }

  get band(): HintBand | undefined {
    return this.shown
  }

  show(band: HintBand | undefined): void {
    if (band?.axis === this.shown?.axis && band?.from === this.shown?.from && band?.to === this.shown?.to) return
    this.shown = band
    for (const child of [...this.group.children]) {
      ;(child as Mesh | LineSegments).geometry.dispose()
      child.removeFromParent()
    }
    if (!band) return
    // three's sphere lays longitude 0 at phi 180°, and theta runs down from the north pole.
    const geometry =
      band.axis === "latitude"
        ? new SphereGeometry(this.radius, 128, 16, 0, 2 * Math.PI, (90 - band.to) * RAD, (band.to - band.from) * RAD)
        : new SphereGeometry(
            this.radius,
            32,
            64,
            (band.from + 180) * RAD,
            ((band.to - band.from + 360) % 360 || 360) * RAD
          )
    const fill = new Mesh(geometry, this.fill)
    const points: number[] = []
    const p = new Vector3()
    for (const edge of [band.from, band.to]) {
      for (let i = 0; i < STEPS; i++) {
        for (const k of [i, i + 1]) {
          const at =
            band.axis === "latitude"
              ? { lat: edge, lon: -180 + (360 * k) / STEPS }
              : { lat: -90 + (180 * k) / STEPS, lon: edge }
          latLonToLocal(at, p).multiplyScalar(this.radius).toArray(points, points.length)
        }
      }
    }
    const lines = new LineSegments(
      new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3)),
      this.edge
    )
    fill.renderOrder = lines.renderOrder = 1
    this.group.add(fill, lines)
  }
}
