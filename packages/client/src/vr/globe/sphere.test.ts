import { describe, expect, it } from "vite-plus/test"
import { SphereGeometry, Vector3 } from "three"
import { latLonToLocal, localToLatLon, raySphere } from "./sphere"

describe("globe coordinates", () => {
  it("put each place where SphereGeometry draws its pixel of an equirectangular texture", () => {
    const geometry = new SphereGeometry(1, 36, 18)
    const positions = geometry.getAttribute("position")
    const uvs = geometry.getAttribute("uv")
    const vertex = new Vector3()
    for (let i = 0; i < positions.count; i++) {
      const lat = (uvs.getY(i) - 0.5) * 180
      if (Math.abs(lat) > 89) continue
      const lon = uvs.getX(i) * 360 - 180
      latLonToLocal({ lat, lon }, vertex)
      expect(vertex.distanceTo(new Vector3().fromBufferAttribute(positions, i))).toBeLessThan(1e-6)
    }
  })

  it("read a point back as the same place", () => {
    for (const point of [
      { lat: 51.5, lon: -0.1 },
      { lat: -33.9, lon: 151.2 },
      { lat: 64.1, lon: -179.9 }
    ]) {
      const back = localToLatLon(latLonToLocal(point).multiplyScalar(0.3))
      expect(back.lat).toBeCloseTo(point.lat, 9)
      expect(back.lon).toBeCloseTo(point.lon, 9)
    }
  })
})

describe("raySphere", () => {
  const centre = new Vector3(0, 1, -2)
  it("finds the near side", () => {
    expect(raySphere(new Vector3(0, 1, 0), new Vector3(0, 0, -1), centre, 0.5)).toBeCloseTo(1.5)
  })
  it("misses past the edge, behind, and from inside", () => {
    expect(raySphere(new Vector3(0.6, 1, 0), new Vector3(0, 0, -1), centre, 0.5)).toBeUndefined()
    expect(raySphere(new Vector3(0, 1, 0), new Vector3(0, 0, 1), centre, 0.5)).toBeUndefined()
    expect(raySphere(centre, new Vector3(0, 0, 1), centre, 0.5)).toBeUndefined()
  })
})
