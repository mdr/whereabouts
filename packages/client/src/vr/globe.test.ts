// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { Vector3 } from "three"
import { Globe } from "./globe"
import { latLonToLocal } from "./sphere"

describe("the VR globe turning to an answer", () => {
  it("brings the place to face the eye, north up", () => {
    const globe = new Globe(1)
    const eye = new Vector3(0, 1.6, 0)
    globe.place(eye, new Vector3(0, 0, -1))
    globe.update(0.1, {}, { x: 0, y: 0 })
    const at = { lat: -51, lon: -73 }
    globe.turnToward(at, eye)
    for (let i = 0; i < 20; i++) globe.update(0.1, {}, { x: 0, y: 0 })
    const q = globe.group.quaternion
    const toEye = eye.clone().sub(globe.centre).normalize()
    expect(latLonToLocal(at).applyQuaternion(q).dot(toEye)).toBeCloseTo(1, 5)
    const north = new Vector3(0, 1, 0).applyQuaternion(q)
    // North points up, as far as it can with the place facing the eye.
    expect(north.y).toBeGreaterThan(0)
    expect(Math.abs(north.dot(new Vector3().crossVectors(toEye, new Vector3(0, 1, 0)).normalize()))).toBeLessThan(1e-6)
  })
})
