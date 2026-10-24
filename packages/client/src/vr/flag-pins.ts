/**
 * Every country's flag on the globe, at the reveal of a flag round: a small
 * flag facing out from the top of a pin stuck in the country's land. All
 * the flags are one mesh, cut from one picture of them all.
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
  SRGBColorSpace,
  Vector3
} from "three"
import type { FlagCode, LatLon } from "@whereabouts/shared"
import { flagUrl } from "../flags"
import { latLonToLocal } from "./sphere"

export interface VrFlagPin {
  flag: FlagCode
  at: LatLon
}

/** Each flag's cell in the picture of them all, in pixels. */
const CELL_W = 64
const CELL_H = 48
const COLUMNS = 16

const up = new Vector3(0, 1, 0)

interface Built {
  flags: Mesh<BufferGeometry, MeshBasicMaterial>
  poles: LineSegments
}

export class FlagPins {
  readonly group = new Group()
  private readonly base: number
  private readonly size: { pin: number; w: number; h: number }
  private key = ""
  /** Each show() outdates the pictures still loading for earlier ones. */
  private asked = 0
  private built: Built | undefined = undefined
  private hidden = false

  /** `base`: the radius pins stand on; `pin`, `w`, `h`: pin length and flag size, in the same units. */
  constructor(base: number, size: { pin: number; w: number; h: number }) {
    this.base = base
    this.size = size
    this.group.visible = false
  }

  /** How many flags show, for the browser tests. */
  get shown(): number {
    return this.group.visible ? this.key.split(",").length : 0
  }

  show(pins: VrFlagPin[] | undefined): void {
    const key = pins ? pins.map((p) => p.flag).join() : ""
    if (key !== this.key) {
      this.key = key
      const asked = ++this.asked
      this.drop()
      if (pins)
        void this.build(pins).then((built) => {
          if (asked !== this.asked || !built) return
          this.built = built
          this.group.add(built.flags, built.poles)
          this.apply()
        })
    }
    this.apply()
  }

  /** Hidden while zoomed in, where the page's map shows its own detail. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    this.apply()
  }

  private apply(): void {
    this.group.visible = this.built !== undefined && !this.hidden
  }

  private drop(): void {
    const built = this.built
    if (!built) return
    this.built = undefined
    this.group.clear()
    built.flags.geometry.dispose()
    built.flags.material.map?.dispose()
    built.poles.geometry.dispose()
  }

  private async build(pins: VrFlagPin[]): Promise<Built | undefined> {
    const rows = Math.ceil(pins.length / COLUMNS)
    const canvas = document.createElement("canvas")
    canvas.width = COLUMNS * CELL_W
    canvas.height = rows * CELL_H
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined
    await Promise.all(
      pins.map(async (p, i) => {
        const url = await flagUrl(p.flag)
        if (!url) return
        const img = new Image()
        img.src = url
        await img.decode().catch(() => undefined)
        ctx.drawImage(img, (i % COLUMNS) * CELL_W, Math.floor(i / COLUMNS) * CELL_H, CELL_W, CELL_H)
      })
    )
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace

    const { pin, w, h } = this.size
    const position = new Float32Array(pins.length * 4 * 3)
    const uv = new Float32Array(pins.length * 4 * 2)
    const index = new Uint32Array(pins.length * 6)
    const lines = new Float32Array(pins.length * 2 * 3)
    const n = new Vector3()
    const east = new Vector3()
    const north = new Vector3()
    const foot = new Vector3()
    const top = new Vector3()
    const corner = new Vector3()
    pins.forEach((p, i) => {
      latLonToLocal(p.at, n)
      east.crossVectors(up, n).normalize()
      north.crossVectors(n, east)
      foot.copy(n).multiplyScalar(this.base)
      top.copy(n).multiplyScalar(this.base + pin)
      foot.toArray(lines, i * 6)
      top.toArray(lines, i * 6 + 3)
      // The flag's lower left corner at the pin's top, in the plane facing out.
      ;[
        [0, 0],
        [w, 0],
        [w, h],
        [0, h]
      ].forEach(([x, y], k) => {
        corner
          .copy(top)
          .addScaledVector(east, x!)
          .addScaledVector(north, y!)
          .toArray(position, (i * 4 + k) * 3)
      })
      const u0 = (i % COLUMNS) / COLUMNS
      const v1 = 1 - Math.floor(i / COLUMNS) / rows
      const u1 = u0 + 1 / COLUMNS
      const v0 = v1 - 1 / rows
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8)
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
    })
    const flags = new BufferGeometry()
    flags.setAttribute("position", new BufferAttribute(position, 3))
    flags.setAttribute("uv", new BufferAttribute(uv, 2))
    flags.setIndex(new BufferAttribute(index, 1))
    const poles = new BufferGeometry()
    poles.setAttribute("position", new BufferAttribute(lines, 3))
    return {
      flags: new Mesh(flags, new MeshBasicMaterial({ map: texture })),
      poles: new LineSegments(poles, new LineBasicMaterial({ color: "#e5e7eb" }))
    }
  }
}
