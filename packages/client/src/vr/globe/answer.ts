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
import type { Theme } from "../../map/themes"
import { latLonToLocal } from "./sphere"
import type { Metres } from "@whereabouts/shared/units"
import type { Outline } from "@whereabouts/shared/questions"
import { VrAnswerType, type VrAnswer } from "../view/view"

const PIN_LENGTH: Metres = 0.035
const up = new Vector3(0, 1, 0)

export class AnswerMarker {
  readonly group = new Group()
  private readonly pin = new Group()
  private readonly outline: LineSegments
  private readonly disputed: LineSegments
  private readonly radius: Metres

  constructor(theme: Theme, radius: Metres) {
    this.radius = radius
    const material = new MeshBasicMaterial({ color: theme.answer })
    const stalk = new Mesh(new CylinderGeometry(0.06, 0.02, 1, 12).translate(0, 0.5, 0), material)
    const head = new Mesh(new SphereGeometry(0.18, 20, 12), material)
    head.position.y = 1
    this.pin.add(stalk, head)
    this.outline = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: theme.answer }))
    this.disputed = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: theme.disputed }))
    this.group.add(this.pin, this.outline, this.disputed)
    this.group.visible = false
  }

  show(answer: VrAnswer | undefined): void {
    this.group.visible = answer !== undefined
    this.pin.visible = answer?.type === VrAnswerType.POINT
    this.outline.visible = answer?.type === VrAnswerType.OUTLINE
    this.disputed.visible = answer?.type === VrAnswerType.OUTLINE && answer.disputed !== undefined
    if (!answer) return
    if (answer.type === VrAnswerType.POINT) {
      const at = latLonToLocal(answer.point)
      this.pin.position.copy(at).multiplyScalar(this.radius)
      this.pin.quaternion.copy(new Quaternion().setFromUnitVectors(up, at))
      return
    }
    this.draw(this.outline, answer.outline)
    this.draw(this.disputed, answer.disputed ?? [])
  }

  private draw(lines: LineSegments, outline: Outline): void {
    const points: number[] = []
    const p = new Vector3()
    for (const polygon of outline)
      for (const ring of polygon)
        for (let i = 0; i < ring.length - 1; i++)
          for (const [lon, lat] of [ring[i]!, ring[i + 1]!])
            latLonToLocal({ lat: lat, lon: lon }, p).multiplyScalar(this.radius).toArray(points, points.length)
    lines.geometry.dispose()
    lines.geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3))
  }

  /** `globeScale`: the globe's zoom, which the pin undoes. */
  update(globeScale: number): void {
    this.pin.scale.setScalar(PIN_LENGTH / globeScale)
  }
}
