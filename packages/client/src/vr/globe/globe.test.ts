// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vite-plus/test"
import { Vector3 } from "three"
import { Globe } from "./globe"
import { Hand } from "../hands/hand"
import { latLonToLocal } from "./sphere"

// happy-dom draws nothing: the stand's printed textures need a 2D context that accepts every call.
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
})

const eye = new Vector3(0, 1.6, 0)

function placed(): Globe {
  const globe = new Globe(1)
  globe.place(eye, new Vector3(0, 0, -1))
  globe.update(0.1, {}, { x: 0, y: 0 })
  return globe
}

/** North stays in the upright plane through the eye: the globe never rolls. */
function expectNoRoll(globe: Globe) {
  const north = new Vector3(0, 1, 0).applyQuaternion(globe.group.quaternion)
  const toEye = eye.clone().sub(globe.centre).normalize()
  const side = new Vector3().crossVectors(toEye, new Vector3(0, 1, 0)).normalize()
  expect(Math.abs(north.dot(side))).toBeLessThan(1e-6)
}

describe("the VR globe", () => {
  it("turns to bring an answer to face the eye, north up", () => {
    const globe = placed()
    const at = { lat: -51, lon: -73 }
    globe.turnToward(at, Math.PI, eye)
    for (let i = 0; i < 20; i++) globe.update(0.1, {}, { x: 0, y: 0 })
    const q = globe.group.quaternion
    const toEye = eye.clone().sub(globe.centre).normalize()
    expect(latLonToLocal(at).applyQuaternion(q).dot(toEye)).toBeCloseTo(1, 5)
    expect(new Vector3(0, 1, 0).applyQuaternion(q).y).toBeGreaterThan(0)
    expectNoRoll(globe)
    expect(globe.scale).toBe(1)
  })

  it("zooms in to frame a small place, and out to frame a wide one", () => {
    const globe = placed()
    const at = { lat: 51.5, lon: -0.1 }
    globe.turnToward(at, 0.25, eye)
    for (let i = 0; i < 20; i++) globe.update(0.1, {}, { x: 0, y: 0 })
    const toEye = eye.clone().sub(globe.centre).normalize()
    expect(latLonToLocal(at).applyQuaternion(globe.group.quaternion).dot(toEye)).toBeCloseTo(1, 5)
    // The 0.25 radians either side spans some tens of centimetres.
    const across = 2 * globe.radius * Math.sin(0.25)
    expect(across).toBeGreaterThan(0.3)
    expect(across).toBeLessThan(1)
    globe.turnToward(at, 1, eye)
    for (let i = 0; i < 20; i++) globe.update(0.1, {}, { x: 0, y: 0 })
    expect(globe.scale).toBeLessThan(3)
  })

  it("zooms with two hands about the place between them, not the middle", () => {
    const globe = placed()
    // Gripped up and off to one side, the hands then drawn apart.
    const mid = globe.centre.clone().add(new Vector3(0.12, 0.14, 0.12))
    const across = new Vector3(1, 0, 0)
    const hands = (apart: number) => ({
      [Hand.LEFT]: mid.clone().addScaledVector(across, -apart / 2),
      [Hand.RIGHT]: mid.clone().addScaledVector(across, apart / 2)
    })
    globe.update(1 / 60, hands(0.1), { x: 0, y: 0 })
    const spot = globe.group.worldToLocal(mid.clone()).normalize()
    for (let i = 1; i <= 30; i++) globe.update(1 / 60, hands(0.1 + i * 0.01), { x: 0, y: 0 })
    expect(globe.scale).toBeCloseTo(4, 5)
    const spotNow = spot.applyQuaternion(globe.group.quaternion)
    const midNow = mid.clone().sub(globe.centre).normalize()
    expect(spotNow.angleTo(midNow)).toBeLessThan(0.01)
    expectNoRoll(globe)
  })

  it("spins and tilts with a hand dragged across it, and never rolls", () => {
    const globe = placed()
    const start = globe.centre.clone().add(new Vector3(-0.1, 0.1, 0.2))
    const hand = start.clone()
    for (let i = 0; i < 30; i++) {
      // Diagonally, and round in a curve, as a roll would follow.
      hand.add(new Vector3(0.01, -0.006, Math.sin(i / 5) * 0.004))
      globe.update(1 / 60, { [Hand.RIGHT]: hand.clone() }, { x: 0, y: 0 })
    }
    expect(globe.group.quaternion.angleTo(placed().group.quaternion)).toBeGreaterThan(0.1)
    expectNoRoll(globe)
    // Let go: it keeps turning a while, still upright.
    for (let i = 0; i < 30; i++) globe.update(1 / 60, {}, { x: 0, y: 0 })
    expectNoRoll(globe)
  })

  it("spins and zooms with the thumbstick, not within its dead zone", () => {
    const globe = placed()
    const start = globe.group.quaternion.clone()
    for (let i = 0; i < 10; i++) globe.update(0.1, {}, { x: 0.1, y: 0.1 })
    expect(globe.group.quaternion.angleTo(start)).toBeCloseTo(0, 5)
    expect(globe.scale).toBe(1)
    for (let i = 0; i < 10; i++) globe.update(0.1, {}, { x: 0, y: -1 })
    expect(globe.scale).toBeCloseTo(Math.exp(1.2), 5)
    const zoomed = globe.group.quaternion.clone()
    for (let i = 0; i < 10; i++) globe.update(0.1, {}, { x: 1, y: 0 })
    expect(globe.group.quaternion.angleTo(zoomed)).toBeGreaterThan(0.1)
    expectNoRoll(globe)
  })

  it("a grab stops a turn to a place", () => {
    const globe = placed()
    globe.turnToward({ lat: -51, lon: -73 }, Math.PI, eye)
    globe.update(0.1, {}, { x: 0, y: 0 })
    expect(globe.busy).toBe(true)
    globe.update(0.1, { [Hand.RIGHT]: new Vector3(0, 1.6, -0.6) }, { x: 0, y: 0 })
    expect(globe.busy).toBe(false)
  })

  it("zooms back out", () => {
    const globe = placed()
    globe.turnToward({ lat: 51.5, lon: -0.1 }, 0.25, eye)
    for (let i = 0; i < 20; i++) globe.update(0.1, {}, { x: 0, y: 0 })
    expect(globe.scale).toBeGreaterThan(1)
    globe.zoomOut()
    for (let i = 0; i < 20; i++) globe.update(0.1, {}, { x: 0, y: 0 })
    expect(globe.scale).toBe(1)
  })
})
