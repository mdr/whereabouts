/**
 * The answer on the VR globe: a pin for a place, the outline for a country.
 * The pin keeps its size in the hand however far the globe is zoomed.
 */
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3
} from "three"
import type { LatLon } from "@whereabouts/shared"
import type { Theme } from "../themes"
import { latLonToLocal } from "./sphere"

export type VrAnswer = { point: LatLon } | { outline: number[][][][] }

const PIN_M = 0.035
const up = new Vector3(0, 1, 0)

export class AnswerMarker {
  readonly group = new Group()
  private readonly pin = new Group()
  private readonly outline: LineSegments
  private readonly radius: number

  constructor(theme: Theme, radius: number) {
    this.radius = radius
    const material = new MeshBasicMaterial({ color: theme.answer })
    const stalk = new Mesh(new CylinderGeometry(0.06, 0.02, 1, 12).translate(0, 0.5, 0), material)
    const head = new Mesh(new SphereGeometry(0.18, 20, 12), material)
    head.position.y = 1
    this.pin.add(stalk, head)
    this.outline = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: theme.answer }))
    this.group.add(this.pin, this.outline)
    this.group.visible = false
  }

  show(answer: VrAnswer | undefined): void {
    this.group.visible = answer !== undefined
    this.pin.visible = answer !== undefined && "point" in answer
    this.outline.visible = answer !== undefined && "outline" in answer
    if (!answer) return
    if ("point" in answer) {
      const at = latLonToLocal(answer.point)
      this.pin.position.copy(at).multiplyScalar(this.radius)
      this.pin.quaternion.copy(new Quaternion().setFromUnitVectors(up, at))
      return
    }
    const points: number[] = []
    const p = new Vector3()
    for (const polygon of answer.outline)
      for (const ring of polygon)
        for (let i = 0; i < ring.length - 1; i++)
          for (const [lon, lat] of [ring[i]!, ring[i + 1]!])
            latLonToLocal({ lat: lat!, lon: lon! }, p).multiplyScalar(this.radius).toArray(points, points.length)
    this.outline.geometry.dispose()
    this.outline.geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3))
  }

  /** `globeScale`: the globe's zoom, which the pin undoes. */
  update(globeScale: number): void {
    this.pin.scale.setScalar(PIN_M / globeScale)
  }
}
