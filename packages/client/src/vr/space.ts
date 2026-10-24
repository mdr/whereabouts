/**
 * Stars round the player, outside passthrough: points far beyond the moon,
 * sharp at any resolution. They follow the head, so they are as far away as
 * the sky.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Points,
  PointsMaterial,
  Vector3
} from "three"

/** Beyond the moon of the most zoomed globe, within the camera's far plane. */
export const STARS_M = 5000

/** Seeded, so the sky is the same each time. */
function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export class Space {
  readonly group = new Group()

  constructor() {
    const rand = random(7)
    // Faint, middling and bright stars, the dimmest by far the most; sizes in radians.
    for (const [count, size, brightness] of [
      [2600, 0.0022, 0.55],
      [700, 0.0035, 0.8],
      [120, 0.0056, 1]
    ] as const)
      this.group.add(stars(rand, count, size * STARS_M, brightness))
  }

  update(head: Vector3): void {
    this.group.position.copy(head)
  }
}

function stars(rand: () => number, count: number, size: number, brightness: number): Points {
  const position = new Float32Array(count * 3)
  const colour = new Float32Array(count * 3)
  const p = new Vector3()
  const c = new Color()
  for (let i = 0; i < count; i++) {
    // Evenly over the sphere.
    const y = rand() * 2 - 1
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    p.set(r * Math.cos(a), y, r * Math.sin(a))
      .multiplyScalar(STARS_M)
      .toArray(position, i * 3)
    // Mostly white; some blue, some amber.
    const hue = rand()
    c.setHSL(hue < 0.25 ? 0.6 : hue > 0.85 ? 0.1 : 0, hue < 0.25 || hue > 0.85 ? 0.6 : 0, 0.75 + rand() * 0.25)
    c.multiplyScalar(brightness * (0.6 + rand() * 0.4)).toArray(colour, i * 3)
  }
  const g = new BufferGeometry()
  g.setAttribute("position", new BufferAttribute(position, 3))
  g.setAttribute("color", new BufferAttribute(colour, 3))
  const points = new Points(
    g,
    new PointsMaterial({
      size,
      map: dot(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false
    })
  )
  points.renderOrder = -1
  // They move with the head; their bounds would be stale.
  points.frustumCulled = false
  return points
}

function dot(): CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, "rgba(255,255,255,1)")
    g.addColorStop(0.25, "rgba(255,255,255,0.8)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 32)
  }
  return new CanvasTexture(canvas)
}
