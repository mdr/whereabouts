/**
 * Droplets from the spray can, across the spot it paints, and crumbs off
 * the eraser. A fixed pool of points, the dead ones fully transparent.
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, PointsMaterial, Vector3 } from "three"

const MAX = 800
/** How fast droplets fly, in metres a second. */
const DROPLET_SPEED = 2.2
const CRUMB_LIFE_S = 0.7
const GRAVITY = 0.6

const v = new Vector3()
const jitter = new Vector3()

function dot(): CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, "rgba(255,255,255,1)")
    g.addColorStop(0.5, "rgba(255,255,255,0.6)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 32)
  }
  return new CanvasTexture(canvas)
}

/** A point within a ball of radius `r`. */
function inBall(out: Vector3, r: number): Vector3 {
  do out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
  while (out.lengthSq() > 1)
  return out.multiplyScalar(r)
}

export class SprayParticles {
  readonly points: Points<BufferGeometry, PointsMaterial>
  private readonly position = new Float32Array(MAX * 3)
  private readonly colour = new Float32Array(MAX * 4)
  private readonly velocity = new Float32Array(MAX * 3)
  /** Seconds each has left, and had in all. */
  private readonly left = new Float32Array(MAX)
  private readonly life = new Float32Array(MAX)
  private readonly falls = new Uint8Array(MAX)
  private readonly opacity = new Float32Array(MAX)
  private readonly tint = new Color()
  private next = 0
  /** Fractions of a particle owed from earlier frames. */
  private owed = 0

  constructor() {
    const g = new BufferGeometry()
    g.setAttribute("position", new BufferAttribute(this.position, 3))
    g.setAttribute("color", new BufferAttribute(this.colour, 4))
    this.points = new Points(
      g,
      new PointsMaterial({
        size: 0.008,
        map: dot(),
        vertexColors: true,
        transparent: true,
        depthWrite: false
      })
    )
    // They move every frame; their bounds would be stale.
    this.points.frustumCulled = false
    this.points.renderOrder = 3
  }

  /** Droplets from `from` to random points of the spot of radius `spot` round `to`. */
  spray(dt: number, rate: number, from: Vector3, to: Vector3, spot: number, colour: string): void {
    this.tint.set(colour)
    const flight = from.distanceTo(to) / DROPLET_SPEED
    this.emit(dt * rate, (i) => {
      inBall(jitter, 0.004).add(from)
      v.copy(to).add(inBall(new Vector3(), spot)).sub(jitter).divideScalar(flight)
      this.start(i, jitter, v, flight, false, 0.85)
    })
  }

  /** Pale crumbs off the surface at `at`, drifting out along `normal` and falling. */
  crumbs(dt: number, rate: number, at: Vector3, normal: Vector3, spot: number): void {
    this.tint.set("#f6d5dc")
    this.emit(dt * rate, (i) => {
      jitter.copy(at).add(inBall(new Vector3(), spot * 0.6))
      v.copy(normal)
        .multiplyScalar(0.12 + Math.random() * 0.1)
        .add(inBall(new Vector3(), 0.08))
      this.start(i, jitter, v, CRUMB_LIFE_S * (0.6 + Math.random() * 0.4), true, 0.6)
    })
  }

  /** How many are in the air. */
  get live(): number {
    let n = 0
    for (let i = 0; i < MAX; i++) if (this.left[i]! > 0) n++
    return n
  }

  update(dt: number): void {
    const p = this.position
    const vel = this.velocity
    for (let i = 0; i < MAX; i++) {
      if (this.left[i]! <= 0) continue
      const left = (this.left[i] = Math.max(0, this.left[i]! - dt))
      if (this.falls[i]) vel[i * 3 + 1]! -= GRAVITY * dt
      for (let k = 0; k < 3; k++) p[i * 3 + k]! += vel[i * 3 + k]! * dt
      // Fade in fast, out over the last third.
      const t = left / this.life[i]!
      this.colour[i * 4 + 3] = this.opacity[i]! * Math.min(1, t * 3, (1 - t) * 20)
    }
    this.points.geometry.attributes.position!.needsUpdate = true
    this.points.geometry.attributes.color!.needsUpdate = true
  }

  private emit(count: number, start: (i: number) => void): void {
    this.owed += count
    while (this.owed >= 1) {
      this.owed--
      start(this.next)
      this.next = (this.next + 1) % MAX
    }
  }

  private start(i: number, at: Vector3, velocity: Vector3, life: number, falls: boolean, opacity: number): void {
    at.toArray(this.position, i * 3)
    velocity.toArray(this.velocity, i * 3)
    this.tint.toArray(this.colour, i * 4)
    this.colour[i * 4 + 3] = 0
    this.left[i] = this.life[i] = life
    this.falls[i] = falls ? 1 : 0
    this.opacity[i] = opacity
  }
}
