import { describe, expect, it } from "vite-plus/test"
import { Object3D, Vector3 } from "three"
import { PanelClearance } from "./clearance"

const eye = new Vector3(0, 1.6, 0)

function makePanel(x: number, z = -0.6): Object3D {
  const obj = new Object3D()
  obj.position.set(x, 1.5, z)
  return obj
}

function makeGlobe(radius = 0.2) {
  return { centre: new Vector3(0, 1.4, -0.8), radius }
}

function placed(...panels: Object3D[]): PanelClearance {
  const clearance = new PanelClearance()
  clearance.placed(
    eye,
    panels.map((obj) => ({ obj, half: 0.1 }))
  )
  return clearance
}

describe("the panels beside the VR globe", () => {
  it("stay where they were placed while they clear the globe", () => {
    const panel = makePanel(-0.6)
    const clearance = placed(panel)
    clearance.update(makeGlobe())
    expect(panel.position.x).toBeCloseTo(-0.6, 6)
    expect(clearance.gap(makeGlobe())).toBeGreaterThan(0.04)
  })

  it("swing aside, the way they were, when the globe grows over them", () => {
    const panel = makePanel(-0.3)
    const clearance = placed(panel)
    const big = makeGlobe(0.5)
    expect(clearance.gap(big)).toBeLessThan(0)
    clearance.update(big)
    expect(panel.position.x).toBeLessThan(-0.3)
    expect(clearance.gap(big)).toBeCloseTo(0.04, 6)
    expect(panel.position.distanceTo(eye)).toBeCloseTo(new Vector3(-0.3, 1.5, -0.6).distanceTo(eye), 6)
  })

  it("come back to where they were as the globe shrinks", () => {
    const panel = makePanel(-0.3)
    const clearance = placed(panel)
    clearance.update(makeGlobe(0.5))
    clearance.update(makeGlobe(0.05))
    expect(panel.position.x).toBeCloseTo(-0.3, 6)
  })

  it("measure the gap from the narrowest", () => {
    const clearance = placed(makePanel(-0.6), makePanel(0.3))
    const globe = makeGlobe()
    const alone = placed(makePanel(0.3)).gap(globe)
    expect(clearance.gap(globe)).toBeCloseTo(alone, 6)
  })
})
