/**
 * Deep space round the player, outside passthrough: a faint Milky Way band,
 * glowing clouds and a few distant galaxies painted on a far sphere, and
 * stars as points in front of it, sharp at any resolution. It follows the
 * head, so it is as far away as the sky.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  SphereGeometry,
  Vector3
} from "three"

/** Within the camera's far plane (200 m), and beyond the most zoomed globe. */
const SKY_M = 170
const STARS_M = 160
/** The band's tilt and turn, so it doesn't run level round the room. */
const BAND_TILT = 0.5

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
    const texture = new CanvasTexture(drawSky(rand))
    texture.colorSpace = SRGBColorSpace
    const sky = new Mesh(
      new SphereGeometry(SKY_M, 64, 32),
      new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false, fog: false })
    )
    sky.rotation.x = BAND_TILT
    sky.renderOrder = -2
    this.group.add(sky)
    // Faint, middling and bright stars, the dimmest by far the most.
    for (const [count, size, brightness] of [
      [2600, 0.35, 0.55],
      [700, 0.55, 0.8],
      [120, 0.9, 1]
    ] as const)
      this.group.add(stars(rand, count, size, brightness))
    this.group.traverse((o) => (o.frustumCulled = false))
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
    // Evenly over the sphere, but a third crowded towards the band's plane.
    const crowd = rand() < 0.35
    const y = crowd ? (rand() - 0.5) * 0.3 : rand() * 2 - 1
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    p.set(r * Math.cos(a), y, r * Math.sin(a))
    if (crowd) p.applyAxisAngle(new Vector3(1, 0, 0), BAND_TILT)
    p.multiplyScalar(STARS_M).toArray(position, i * 3)
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

/** The sky as an equirectangular picture: the band along its equator, clouds, galaxies. */
function drawSky(rand: () => number): HTMLCanvasElement {
  const W = 2048
  const H = 1024
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas
  ctx.fillStyle = "#03050b"
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, rx: number, ry: number, colour: string, alpha: number, turn = 0) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(turn)
    ctx.scale(rx, ry)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, `rgba(${colour},${alpha})`)
    g.addColorStop(1, `rgba(${colour},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.globalCompositeOperation = "lighter"
  // The band: soft overlapping glows along the equator, wavering, with a brighter core in one part.
  for (let i = 0; i < 420; i++) {
    const x = rand() * W
    const core = Math.exp(-(((x - W * 0.3) / (W * 0.18)) ** 2))
    const y = H / 2 + Math.sin((x / W) * Math.PI * 4) * 18 + (rand() - 0.5) * 90
    const colour = rand() < 0.3 ? "255,214,170" : "170,190,255"
    glow(x, y, 40 + rand() * 120, 14 + rand() * 40, colour, 0.035 + core * 0.05)
  }
  // Dust lanes darken the band's middle.
  ctx.globalCompositeOperation = "source-over"
  for (let i = 0; i < 60; i++) {
    const x = rand() * W
    glow(x, H / 2 + (rand() - 0.5) * 24, 60 + rand() * 120, 6 + rand() * 10, "3,5,11", 0.35)
  }
  ctx.globalCompositeOperation = "lighter"
  // Clouds of colour, here and there.
  for (const colour of ["120,60,170", "40,110,160", "170,60,90", "60,140,130"]) {
    const x = rand() * W
    const y = H * (0.2 + rand() * 0.6)
    for (let i = 0; i < 14; i++)
      glow(x + (rand() - 0.5) * 220, y + (rand() - 0.5) * 120, 50 + rand() * 110, 30 + rand() * 70, colour, 0.05)
  }
  // Distant galaxies: small tilted ellipses with bright cores.
  for (let i = 0; i < 7; i++) {
    const x = rand() * W
    const y = H * (0.12 + rand() * 0.76)
    if (Math.abs(y - H / 2) < 90) continue
    const size = 6 + rand() * 14
    const turn = rand() * Math.PI
    glow(x, y, size * 2.6, size * 0.9, "200,200,255", 0.35, turn)
    glow(x, y, size * 0.8, size * 0.5, "255,240,220", 0.8, turn)
  }
  // Faint dust of stars too small for points.
  for (let i = 0; i < 9000; i++) {
    const y = rand() * H
    const near = Math.exp(-(((y - H / 2) / 140) ** 2))
    if (rand() > 0.35 + near * 0.65) continue
    ctx.fillStyle = `rgba(255,255,255,${0.08 + rand() * 0.25})`
    ctx.fillRect(rand() * W, y, 1, 1)
  }
  return canvas
}
