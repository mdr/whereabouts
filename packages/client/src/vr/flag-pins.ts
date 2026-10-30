/**
 * Every country's flag on the globe, at the reveal of a flag round: a small
 * flag facing out from the top of a pin stuck in the country's land. All
 * the flags are one mesh, cut from one picture of them all, and stay the
 * same real size however far the globe zooms. Pointing at one enlarges it
 * and names it on a card above.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  type Material
} from "three"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { LatLon } from "@whereabouts/shared/geo"
import { FLAG_ATLAS, atlasCell } from "../flag-atlas"
import { latLonToLocal } from "./sphere"

export interface VrFlagPin {
  flag: FlagCode
  name: string
  at: LatLon
  /** The country's outline: rings of lon, lat, lon, lat, … in degrees. */
  rings: Float64Array[]
}

/** In metres, whatever the globe's zoom. */
const PIN_M = 0.012
const FLAG_W_M = 0.016
const FLAG_H_M = 0.012
const LABEL_W_M = 0.16
/** Pointed at, a flag grows this much, and its country's border shows in this colour. */
const HIGHLIGHT = 1.8
const BORDER = "#ff40ff"
/** How far off a flag a ray may pass and still point at it: metres, and radians beyond. */
const POINT_M = 0.01
const POINT_RAD = 0.015

const up = new Vector3(0, 1, 0)
const v = new Vector3()
const w = new Vector3()
const centre = new Vector3()

let atlas: Promise<HTMLImageElement> | undefined = undefined
function loadAtlas(): Promise<HTMLImageElement> {
  atlas ??= (async () => {
    const img = new Image()
    img.src = FLAG_ATLAS.url
    await img.decode()
    return img
  })()
  return atlas
}

/** A ray from a hand, and how far along it the globe is, if it reaches it. */
export interface Pointer {
  origin: Vector3
  dir: Vector3
  globe: number | undefined
}

interface Built {
  pins: VrFlagPin[]
  /** Each pin's foot, in the globe's frame, and its flag's middle from there in metres. */
  feet: Vector3[]
  mids: Vector3[]
  flags: Mesh<BufferGeometry, MeshBasicMaterial>
  poles: LineSegments<BufferGeometry, LineBasicMaterial>
}

export class FlagPins {
  readonly group = new Group()
  /** The name card: in the scene, not the globe, to face the player. */
  readonly label: Mesh<PlaneGeometry, MeshBasicMaterial>
  private readonly base: number
  /** Local units per metre, so the flags don't grow with the globe; and the one pointed at. */
  private readonly uniforms = { uSize: { value: 1 }, uHi: { value: -1 } }
  private key = ""
  /** Each show() outdates the builds still loading for earlier ones. */
  private asked = 0
  private built: Built | undefined = undefined
  /** One atlas on the GPU and one pair of materials, whatever flags show. */
  private materials: Promise<{ flags: MeshBasicMaterial; poles: LineBasicMaterial }> | undefined = undefined
  private readonly labelCanvas = document.createElement("canvas")
  private pointed: number | undefined = undefined
  /** The pointed-at country's border, a layer of the globe's own. */
  readonly border = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: BORDER }))
  private readonly borderRadius: number

  /** `base`: the radius pins stand on, in the globe's frame. */
  /** `borderRadius`: where the pointed-at country's border is drawn, likewise. */
  constructor(base: number, borderRadius: number) {
    this.base = base
    this.borderRadius = borderRadius
    this.group.visible = false
    this.labelCanvas.width = 512
    this.labelCanvas.height = 96
    const texture = new CanvasTexture(this.labelCanvas)
    texture.colorSpace = SRGBColorSpace
    this.label = new Mesh(
      new PlaneGeometry(LABEL_W_M, (LABEL_W_M * this.labelCanvas.height) / this.labelCanvas.width),
      new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false })
    )
    this.label.renderOrder = 5
    this.label.visible = false
    this.border.visible = false
  }

  /** How many flags show, for the browser tests. */
  get shown(): number {
    return this.group.visible ? (this.built?.pins.length ?? 0) : 0
  }

  /** The country pointed at, if any, for the browser tests. */
  get named(): string | undefined {
    return this.pointed === undefined ? undefined : this.built?.pins[this.pointed]?.name
  }

  /** The country whose border shows, and in how many segments, for the browser tests. */
  get outlined(): { name: string; segments: number } | undefined {
    if (!this.border.visible || this.pointed === undefined) return undefined
    const name = this.built?.pins[this.pointed]?.name
    const n = this.border.geometry.getAttribute("position").count
    return name === undefined ? undefined : { name, segments: n / 2 }
  }

  /** The flag nearest `to`, and where its middle is, for the browser tests. */
  nearest(to: Vector3): { name: string; at: Vector3 } | undefined {
    const pins = this.built?.pins ?? []
    let best: { name: string; at: Vector3 } | undefined = undefined
    pins.forEach((p, i) => {
      const at = this.middle(i, new Vector3())
      if (!best || at.distanceTo(to) < best.at.distanceTo(to)) best = { name: p.name, at }
    })
    return best
  }

  show(pins: VrFlagPin[] | undefined): void {
    const key = pins ? pins.map((p) => p.flag).join() : ""
    if (key === this.key) return
    this.key = key
    const asked = ++this.asked
    this.drop()
    if (pins)
      void this.build(pins).then((built) => {
        if (asked !== this.asked) {
          built.flags.geometry.dispose()
          built.poles.geometry.dispose()
          return
        }
        this.built = built
        this.group.add(built.flags, built.poles)
        this.group.visible = true
      })
  }

  /** Keeps the flags their real size at the globe's `scale`, and finds the one pointed at. */
  update(scale: number, pointers: Pointer[], head: Vector3): void {
    this.uniforms.uSize.value = 1 / scale
    const pointed = this.group.visible ? this.find(pointers) : undefined
    if (pointed !== this.pointed) {
      this.pointed = pointed
      this.uniforms.uHi.value = pointed ?? -1
      if (pointed !== undefined) {
        void this.drawLabel(this.built!.pins[pointed]!)
        this.outline(this.built!.pins[pointed]!)
      }
    }
    this.border.visible = pointed !== undefined
    this.label.visible = pointed !== undefined
    if (pointed === undefined) return
    // Above the enlarged flag, turned to the eyes.
    const mid = this.middle(pointed, v)
    const out = w.copy(mid).sub(this.group.getWorldPosition(centre)).normalize()
    this.label.position.copy(mid).addScaledVector(out, FLAG_H_M * HIGHLIGHT + 0.025)
    this.label.lookAt(head)
  }

  private outline(pin: VrFlagPin): void {
    const points: number[] = []
    for (const ring of pin.rings)
      for (let i = 0; i < ring.length; i += 2) {
        const j = (i + 2) % ring.length
        for (const k of [i, j])
          latLonToLocal({ lat: ring[k + 1]!, lon: ring[k]! }, v)
            .multiplyScalar(this.borderRadius)
            .toArray(points, points.length)
      }
    this.border.geometry.dispose()
    this.border.geometry = new BufferGeometry().setAttribute(
      "position",
      new BufferAttribute(new Float32Array(points), 3)
    )
  }

  private find(pointers: Pointer[]): number | undefined {
    const built = this.built
    if (!built) return undefined
    let best: number | undefined = undefined
    let bestOff = 1
    for (const { origin, dir, globe } of pointers) {
      built.pins.forEach((_, i) => {
        const mid = this.middle(i, v)
        const t = w.copy(mid).sub(origin).dot(dir)
        // Ahead of the hand, and not round the back of the globe.
        if (t <= 0 || (globe !== undefined && t > globe + 0.03)) return
        const miss = w.addScaledVector(dir, -t).length()
        const off = miss / (POINT_M + POINT_RAD * t)
        if (off < bestOff) [best, bestOff] = [i, off]
      })
    }
    return best
  }

  /** Where flag `i`'s middle is in the world. */
  private middle(i: number, out: Vector3): Vector3 {
    const built = this.built!
    out.copy(built.mids[i]!).multiplyScalar(this.uniforms.uSize.value).add(built.feet[i]!)
    return this.group.localToWorld(out)
  }

  private drop(): void {
    const built = this.built
    this.group.visible = false
    this.label.visible = false
    this.border.visible = false
    this.pointed = undefined
    this.uniforms.uHi.value = -1
    if (!built) return
    this.built = undefined
    this.group.clear()
    built.flags.geometry.dispose()
    built.poles.geometry.dispose()
  }

  private async drawLabel(pin: VrFlagPin): Promise<void> {
    const img = await loadAtlas()
    const ctx = this.labelCanvas.getContext("2d")
    if (!ctx) return
    const { width: w, height: h } = this.labelCanvas
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "rgba(17, 24, 33, 0.92)"
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, 24)
    ctx.fill()
    const cell = atlasCell(pin.flag)
    const [cw, ch] = FLAG_ATLAS.cell
    if (cell) ctx.drawImage(img, cell[0] * cw, cell[1] * ch, cw, ch, 18, 18, 80, 60)
    ctx.fillStyle = "#f0fdff"
    ctx.font = "700 40px system-ui, sans-serif"
    ctx.textBaseline = "middle"
    ctx.fillText(pin.name, 116, h / 2, w - 134)
    this.label.material.map!.needsUpdate = true
  }

  private sharedMaterials(): Promise<{ flags: MeshBasicMaterial; poles: LineBasicMaterial }> {
    this.materials ??= loadAtlas().then((img) => {
      const texture = new Texture(img)
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
      return {
        flags: this.offsetting(new MeshBasicMaterial({ map: texture })),
        poles: this.offsetting(new LineBasicMaterial({ color: "#e5e7eb" }))
      }
    })
    return this.materials
  }

  private async build(pins: VrFlagPin[]): Promise<Built> {
    const materials = await this.sharedMaterials()

    // Each vertex: its pin's foot on the globe, and an offset from it in
    // metres, which the shader shrinks as the globe grows.
    const position = new Float32Array(pins.length * 4 * 3)
    const offset = new Float32Array(pins.length * 4 * 3)
    const pinIndex = new Float32Array(pins.length * 4)
    const uv = new Float32Array(pins.length * 4 * 2)
    const index = new Uint32Array(pins.length * 6)
    const linePosition = new Float32Array(pins.length * 2 * 3)
    const lineOffset = new Float32Array(pins.length * 2 * 3)
    const lineIndex = new Float32Array(pins.length * 2)
    const feet: Vector3[] = []
    const mids: Vector3[] = []
    const east = new Vector3()
    const north = new Vector3()
    const corner = new Vector3()
    const { columns, rows } = FLAG_ATLAS
    pins.forEach((p, i) => {
      const n = latLonToLocal(p.at)
      const foot = n.clone().multiplyScalar(this.base)
      feet.push(foot)
      east.crossVectors(up, n).normalize()
      north.crossVectors(n, east)
      mids.push(
        n
          .clone()
          .multiplyScalar(PIN_M + FLAG_H_M / 2)
          .addScaledVector(east, FLAG_W_M / 2)
      )
      for (const k of [0, 1]) foot.toArray(linePosition, (i * 2 + k) * 3)
      v.copy(n)
        .multiplyScalar(PIN_M)
        .toArray(lineOffset, (i * 2 + 1) * 3)
      lineIndex.fill(i, i * 2, i * 2 + 2)
      // The flag's lower left corner at the pin's top, in the plane facing out.
      for (const [k, [x, y]] of [
        [0, 0],
        [FLAG_W_M, 0],
        [FLAG_W_M, FLAG_H_M],
        [0, FLAG_H_M]
      ].entries()) {
        foot.toArray(position, (i * 4 + k) * 3)
        corner
          .copy(n)
          .multiplyScalar(PIN_M)
          .addScaledVector(east, x!)
          .addScaledVector(north, y!)
          .toArray(offset, (i * 4 + k) * 3)
      }
      pinIndex.fill(i, i * 4, i * 4 + 4)
      const [c, r] = atlasCell(p.flag) ?? [0, rows - 1]
      const [u0, u1] = [c / columns, (c + 1) / columns]
      const [v0, v1] = [1 - (r + 1) / rows, 1 - r / rows]
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8)
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
    })
    const flags = new BufferGeometry()
    flags.setAttribute("position", new BufferAttribute(position, 3))
    flags.setAttribute("offset", new BufferAttribute(offset, 3))
    flags.setAttribute("pin", new BufferAttribute(pinIndex, 1))
    flags.setAttribute("uv", new BufferAttribute(uv, 2))
    flags.setIndex(new BufferAttribute(index, 1))
    const poles = new BufferGeometry()
    poles.setAttribute("position", new BufferAttribute(linePosition, 3))
    poles.setAttribute("offset", new BufferAttribute(lineOffset, 3))
    poles.setAttribute("pin", new BufferAttribute(lineIndex, 1))
    const flagMesh = new Mesh(flags, materials.flags)
    const poleLines = new LineSegments(poles, materials.poles)
    // Their feet are all the bounds know of; the offsets reach beyond.
    flagMesh.frustumCulled = poleLines.frustumCulled = false
    return { pins, feet, mids, flags: flagMesh, poles: poleLines }
  }

  /** Has the material place each vertex at its foot plus its offset, scaled. */
  private offsetting<M extends Material>(material: M): M {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec3 offset;\nattribute float pin;\nuniform float uSize;\nuniform float uHi;"
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = position + offset * uSize * (abs(pin - uHi) < 0.5 ? ${HIGHLIGHT.toFixed(1)} : 1.0);`
        )
    }
    return material
  }
}
