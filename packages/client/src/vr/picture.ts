/**
 * The question's photo or flag, on a card above the VR menu. A grip on it
 * takes it in hand, facing the player, for a closer look; letting go puts
 * it back. WebGL takes only pictures the browser may read back, and the
 * page's photo links go through redirects that don't allow it, so photos
 * come by Commons' API.
 */
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  SRGBColorSpace,
  Vector3,
  type Object3D
} from "three"
import type { FlagCode } from "@whereabouts/shared"
import { flagUrl } from "../flags"
import type { Hand } from "./globe"

export type VrPicture = { photo: string } | { flag: FlagCode }

const MAX_W = 0.38
const MAX_H = 0.26
const MAX_PX = 1024
/** How close a hand need be to take the picture without pointing at it. */
const REACH_M = 0.08

const raycaster = new Raycaster()
const at = new Vector3()

export class Picture {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
  private readonly canvas = document.createElement("canvas")
  private readonly texture: CanvasTexture
  /** Each show() outdates the pictures still loading for earlier ones. */
  private asked = 0
  private held: Hand | undefined = undefined

  constructor() {
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.texture }))
    this.mesh.visible = false
  }

  get height(): number {
    return this.mesh.visible ? this.mesh.scale.y : 0
  }

  get heldBy(): Hand | undefined {
    return this.held
  }

  /** Whether a hand at `grip`, pointing from `origin` along `dir`, is on the picture. */
  reaches(grip: Vector3, origin: Vector3, dir: Vector3): boolean {
    if (!this.mesh.visible) return false
    raycaster.set(origin, dir)
    if (raycaster.intersectObject(this.mesh).length > 0) return true
    const size = Math.max(this.mesh.scale.x, this.mesh.scale.y) / 2
    return this.mesh.getWorldPosition(at).distanceTo(grip) < size + REACH_M
  }

  grab(hand: Hand, scene: Object3D): void {
    this.held = hand
    scene.attach(this.mesh)
  }

  /** Held by its lower edge, turned to the eyes. */
  hold(grip: Vector3, head: Vector3): void {
    this.mesh.position.copy(grip).add(at.set(0, 0.02 + this.mesh.scale.y / 2, 0))
    this.mesh.lookAt(head)
  }

  release(home: Object3D): void {
    if (!this.held) return
    this.held = undefined
    home.add(this.mesh)
    this.mesh.rotation.set(0, 0, 0)
  }

  show(picture: VrPicture | undefined): void {
    const asked = ++this.asked
    this.mesh.visible = false
    if (!picture) return
    void load(picture).then(
      (img) => {
        if (asked !== this.asked || !img) return
        // An SVG flag can report no size of its own; flags are 4:3.
        const [w, h] = img.naturalWidth > 0 ? [img.naturalWidth, img.naturalHeight] : [4, 3]
        const fit = Math.min(MAX_PX / w, MAX_PX / h)
        this.canvas.width = Math.round(w * fit)
        this.canvas.height = Math.round(h * fit)
        this.canvas.getContext("2d")!.drawImage(img, 0, 0, this.canvas.width, this.canvas.height)
        this.texture.needsUpdate = true
        const size = Math.min(MAX_W / w, MAX_H / h)
        this.mesh.scale.set(w * size, h * size, 1)
        this.mesh.visible = true
      },
      (err: unknown) => console.warn("could not load the picture for VR", err)
    )
  }
}

async function load(picture: VrPicture): Promise<HTMLImageElement | undefined> {
  const src = "flag" in picture ? await flagUrl(picture.flag) : await photoUrl(picture.photo)
  if (!src) return undefined
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.src = src
  await img.decode()
  return img
}

async function photoUrl(file: string): Promise<string | undefined> {
  const api = new URL("https://commons.wikimedia.org/w/api.php")
  api.search = new URLSearchParams({
    action: "query",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(MAX_PX),
    format: "json",
    origin: "*"
  }).toString()
  const res = (await (await fetch(api)).json()) as {
    query?: { pages?: Record<string, { imageinfo?: { thumburl?: string }[] }> }
  }
  return Object.values(res.query?.pages ?? {})[0]?.imageinfo?.[0]?.thumburl
}
