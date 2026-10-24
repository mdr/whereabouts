/**
 * The things in the player's hands and the globe's stand, turned and shaped
 * in code: a spray can, an eraser in its sleeve, a wooden stand with a brass
 * yoke. Metal and lacquer reflect a soft room (see `reflections`).
 */
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PMREMGenerator,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Object3D,
  type Texture,
  type WebGLRenderer
} from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

/** A soft room for metal and lacquer to reflect. */
export function reflections(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer)
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return texture
}

/** Gives every standard material under `root` the room to reflect. */
export function reflect(root: Object3D, envMap: Texture): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const m = o.material as Material | Material[]
    for (const material of Array.isArray(m) ? m : [m])
      if (material instanceof MeshStandardMaterial) {
        material.envMap = envMap
        material.needsUpdate = true
      }
  })
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext("2d")!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** A lathe from (radius, height) pairs, in metres. */
const lathe = (points: [number, number][], segments = 32) =>
  new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    segments
  )

/**
 * A spray can lying along -Z, its actuator forward: a domed base, a
 * printed label in the brush's colour, a shoulder up to the valve.
 */
export function buildCan(brush: string): Group {
  const can = new Group()
  const metal = new MeshStandardMaterial({ color: "#c9d1db", metalness: 0.85, roughness: 0.28 })
  const R = 0.033
  // Bottom to top: the rim it stands on, the body, the shoulder, the bead round the valve cup.
  const body = lathe([
    [0, -0.058],
    [0.02, -0.061],
    [R - 0.002, -0.065],
    [R, -0.063],
    [R, 0.045],
    [R - 0.002, 0.052],
    [R - 0.007, 0.058],
    [0.019, 0.062],
    [0.016, 0.064],
    [0.017, 0.066],
    [0.014, 0.068],
    [0.009, 0.069],
    [0, 0.069]
  ])
  can.add(new Mesh(body, metal))

  const label = canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = "#16202b"
    ctx.fillRect(0, 0, 512, 128)
    ctx.fillStyle = brush
    ctx.fillRect(0, 18, 512, 92)
    ctx.fillStyle = "#16202b"
    ctx.font = "bold 44px system-ui, sans-serif"
    ctx.textBaseline = "middle"
    for (const x of [24, 280]) ctx.fillText("WHEREABOUTS", x, 66)
    ctx.fillStyle = "rgba(255,255,255,0.5)"
    ctx.fillRect(0, 22, 512, 4)
  })
  const sleeve = new Mesh(
    new CylinderGeometry(R + 0.0004, R + 0.0004, 0.085, 32, 1, true).translate(0, -0.008, 0),
    new MeshStandardMaterial({ map: label, metalness: 0.2, roughness: 0.4 })
  )
  can.add(sleeve)

  // The actuator: a plastic button in the brush's colour, its jet forward.
  const plastic = new MeshStandardMaterial({ color: brush, roughness: 0.35 })
  const actuator = new Mesh(
    lathe(
      [
        [0, 0],
        [0.011, 0],
        [0.012, 0.004],
        [0.0115, 0.012],
        [0.009, 0.0145],
        [0, 0.015]
      ],
      24
    ),
    plastic
  )
  actuator.position.y = 0.069
  const jet = new Mesh(new CylinderGeometry(0.0022, 0.0022, 0.002, 12), new MeshStandardMaterial({ color: "#111" }))
  jet.position.y = 0.0845
  can.add(actuator, jet)
  // Lathes turn about +Y; the can points along the ray.
  can.rotation.x = -Math.PI / 2
  const held = new Group()
  held.add(can)
  return held
}

/** An eraser lying along -Z, its worn rubber end forward, the back in a printed card sleeve. */
export function buildEraser(): Group {
  const eraser = new Group()
  const rubber = new Mesh(
    new RoundedBoxGeometry(0.045, 0.025, 0.075, 4, 0.007),
    new MeshStandardMaterial({ color: "#f2a6b6", roughness: 0.85 })
  )
  rubber.position.z = -0.025
  const label = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = "#2f6fd6"
    ctx.fillRect(0, 0, 256, 128)
    ctx.fillStyle = "#f4f7fb"
    ctx.fillRect(0, 34, 256, 60)
    ctx.fillStyle = "#2f6fd6"
    ctx.font = "bold 40px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("ERASE", 128, 66)
  })
  const blue = new MeshStandardMaterial({ color: "#2f6fd6", roughness: 0.6 })
  const printed = new MeshStandardMaterial({ map: label, roughness: 0.6 })
  // Box faces: +x, -x, +y, -y, +z, -z. The print is on top and bottom.
  const sleeve = new Mesh(new BoxGeometry(0.047, 0.027, 0.06), [blue, blue, printed, printed, blue, blue])
  sleeve.position.z = 0.017
  eraser.add(rubber, sleeve)
  return eraser
}

/**
 * The globe's stand, for a globe of radius `r` at its origin: a turned
 * wooden foot and stem, and a brass yoke round the lower half of the globe's
 * outline as the player sees it, up to pivots at the ends of its tilt axis
 * (the local Z axis; local +X points away from the player).
 */
export function buildStand(r: number): Group {
  const stand = new Group()
  const brass = new MeshStandardMaterial({ color: "#c9a25a", metalness: 0.9, roughness: 0.3 })
  const grain = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#5c3b24"
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(${i % 3 ? "40,22,10" : "120,80,48"},${0.15 + (i % 5) * 0.05})`
      ctx.lineWidth = 1 + (i % 4)
      ctx.beginPath()
      const x = (i * 37) % 256
      ctx.moveTo(x, 0)
      for (let y = 0; y <= 256; y += 16) ctx.lineTo(x + Math.sin(y / 40 + i) * 6, y)
      ctx.stroke()
    }
  })
  const wood = new MeshStandardMaterial({ map: grain, color: "#ffffff", metalness: 0, roughness: 0.45 })

  const ring = r * 1.08
  // A torus arc runs from +X round through +Y: turned to run from +Z under the globe to -Z.
  const arc = new Mesh(new TorusGeometry(ring, r * 0.022, 12, 96, Math.PI), brass)
  arc.rotation.z = Math.PI
  const yoke = new Group()
  yoke.add(arc)
  yoke.rotation.y = Math.PI / 2
  stand.add(yoke)
  for (const z of [1, -1]) {
    const pivot = new Mesh(new CylinderGeometry(r * 0.03, r * 0.03, ring - r, 16).rotateX(Math.PI / 2), brass)
    pivot.position.z = (z * (ring + r)) / 2
    const knob = new Mesh(new SphereGeometry(r * 0.045, 20, 12), brass)
    knob.position.z = z * (ring + r * 0.02)
    stand.add(pivot, knob)
  }

  // Turned wood from the foot up to a brass collar under the yoke.
  const stem = r * 0.5
  const turned = lathe(
    (
      [
        [0, 0],
        [0.5, 0],
        [0.5, 0.03],
        [0.46, 0.05],
        [0.47, 0.07],
        [0.4, 0.1],
        [0.2, 0.13],
        [0.1, 0.16],
        [0.07, 0.22],
        [0.11, 0.3],
        [0.08, 0.4],
        [0.05, 0.47],
        [0.06, 0.5],
        [0, 0.5]
      ] as [number, number][]
    ).map(([x, y]) => [x * r, y * r]),
    48
  )
  const base = new Mesh(turned, wood)
  base.position.y = -ring - stem
  const collar = new Mesh(new SphereGeometry(r * 0.05, 20, 12), brass)
  collar.position.y = -ring - r * 0.01
  stand.add(base, collar)
  return stand
}
