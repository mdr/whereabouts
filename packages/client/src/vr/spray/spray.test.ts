// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { signal } from "@preact/signals"
import { Object3D, Vector3 } from "three"
import { greatCircleDistance, type LatLon } from "@whereabouts/shared/geo"
import { THEME } from "../../map/themes"
import { Tool } from "../../paint/tool"
import { Globe } from "../globe/globe"
import { HandTool } from "./spray"

// happy-dom draws nothing: the tools' printed labels need a 2D context, and gradients, that accept every call.
beforeAll(() => {
  const ctx: object = new Proxy({}, { get: () => () => ctx, set: () => true })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
})

const eye = new Vector3(0, 1.6, 0)

/** A globe turned to face `at` to the eye, within `reach` radians either side. */
function globeFacing(at: LatLon, reach: number): Globe {
  const globe = new Globe(1)
  globe.place(eye, new Vector3(0, 0, -1))
  globe.update(0.1, {}, { x: 0, y: 0 })
  globe.turnToward(at, reach, eye)
  for (let i = 0; i < 20; i++) globe.update(0.1, {}, { x: 0, y: 0 })
  return globe
}

/** A hand at the eye, its ray pointing at the globe's centre. */
function handAimedAt(globe: Globe): HandTool {
  const scene = new Object3D()
  const grip = new Object3D()
  const ray = new Object3D()
  ray.position.copy(eye)
  // The ray runs down the controller's -Z.
  ray.lookAt(eye.clone().multiplyScalar(2).sub(globe.centre))
  scene.add(grip, ray)
  return new HandTool(grip, ray, scene, THEME)
}

const makePaint = () => ({ enabled: signal(true), stamp: vi.fn(), fillOutside: vi.fn() })

describe("a hand's spray", () => {
  it("lands where the turned globe faces it", () => {
    const at = { lat: 48.9, lon: 2.3 }
    const globe = globeFacing(at, Math.PI)
    const paint = makePaint()
    handAimedAt(globe).update(1, globe, 1, false, paint, undefined)
    const [landed] = paint.stamp.mock.calls[0]! as [LatLon]
    expect(greatCircleDistance(landed, at)).toBeLessThan(1)
  })

  it("covers less ground on a globe zoomed in", () => {
    const at = { lat: -33.9, lon: 151.2 }
    const radius = (reach: number) => {
      const globe = globeFacing(at, reach)
      const paint = makePaint()
      handAimedAt(globe).update(1, globe, 1, false, paint, undefined)
      return paint.stamp.mock.calls[0]![1] as number
    }
    expect(radius(0.25)).toBeLessThan(radius(Math.PI) / 2)
  })

  it("paints nothing while painting is off, or the ray is on a menu", () => {
    const globe = globeFacing({ lat: 0, lon: 0 }, Math.PI)
    const off = { ...makePaint(), enabled: signal(false) }
    handAimedAt(globe).update(1, globe, 1, false, off, undefined)
    const blocked = makePaint()
    handAimedAt(globe).update(1, globe, 1, true, blocked, undefined)
    expect(off.stamp).not.toHaveBeenCalled()
    expect(blocked.stamp).not.toHaveBeenCalled()
  })
})

describe("the pail", () => {
  it("fills once for each pull of the trigger, however long it is held", () => {
    const globe = globeFacing({ lat: 52, lon: 19 }, Math.PI)
    const paint = makePaint()
    const hand = handAimedAt(globe)
    hand.setTool(Tool.FILL)
    for (const [time, trigger] of [
      [1, 1],
      [1.1, 1],
      [1.2, 0.6],
      [1.3, 0],
      [1.4, 1]
    ] as const)
      hand.update(time, globe, trigger, false, paint, undefined)
    expect(paint.fillOutside).toHaveBeenCalledTimes(2)
    expect(paint.stamp).not.toHaveBeenCalled()
  })
})
