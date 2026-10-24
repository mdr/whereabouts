/**
 * The question's photo or flag, on a card above the VR menu. A grip on it
 * takes it in hand, facing the player, for a closer look; letting go puts
 * it back. Turned over, a flag shows its reverse and a photo a postcard's
 * back. WebGL takes only pictures the browser may read back, and the
 * page's photo links go through redirects that don't allow it, so photos
 * come by Commons' API.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
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
/**
 * Sharp held a hand's width from the eyes, about 25 pixels a degree; a
 * width Commons serves (it rounds others up).
 */
const MAX_PX = 1920
/** How close a hand need be to take the picture without pointing at it. */
const REACH_M = 0.08
/** A card's thickness, so it has an edge when turned. */
const THICK_M = 0.003
const CARD = "#efe9dd"
/** BoxGeometry's material groups: the four edges, then front (+z) and back (−z). */
const FRONT = 4
const BACK = 5

const raycaster = new Raycaster()
const at = new Vector3()

export class Picture {
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial[]>
  /** Each show() outdates the pictures still loading for earlier ones. */
  private asked = 0
  private held: Hand | undefined = undefined
  private shownBack: "reverse" | "postcard" | undefined = undefined

  constructor() {
    const edge = new MeshBasicMaterial({ color: CARD })
    this.mesh = new Mesh(new BoxGeometry(1, 1, THICK_M), [
      edge,
      edge,
      edge,
      edge,
      new MeshBasicMaterial(),
      new MeshBasicMaterial()
    ])
    this.mesh.visible = false
  }

  /** What its back shows, for the browser tests. */
  get back(): "reverse" | "postcard" | undefined {
    return this.mesh.visible ? this.shownBack : undefined
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

  /**
   * Into the hand: held by its lower edge, turned to the eyes, and from then
   * on turning and tilting with the hand.
   */
  grab(hand: Hand, scene: Object3D, grip: Object3D, head: Vector3): void {
    this.held = hand
    scene.attach(this.mesh)
    this.mesh.position.copy(grip.getWorldPosition(at)).add(at.set(0, 0.02 + this.mesh.scale.y / 2, 0))
    this.mesh.lookAt(head)
    grip.attach(this.mesh)
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
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(w * fit)
        canvas.height = Math.round(h * fit)
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
        // A new texture each time: one already on the GPU keeps its first size.
        const texture = new CanvasTexture(canvas)
        texture.colorSpace = SRGBColorSpace
        // Sharp when tilted too; three caps it at what the GPU allows.
        texture.anisotropy = 16
        const back = "flag" in picture ? reverse(texture) : postcard(canvas.width / canvas.height)
        for (const [i, map] of [
          [FRONT, texture],
          [BACK, back]
        ] as const) {
          const material = this.mesh.material[i]!
          material.map?.dispose()
          material.map = map
          material.needsUpdate = true
        }
        this.shownBack = "flag" in picture ? "reverse" : "postcard"
        const size = Math.min(MAX_W / w, MAX_H / h)
        this.mesh.scale.set(w * size, h * size, 1)
        this.mesh.visible = true
      },
      (err: unknown) => console.warn("could not load the picture for VR", err)
    )
  }
}

/** A flag seen from behind: the same, mirrored. */
function reverse(front: CanvasTexture): CanvasTexture {
  const t = front.clone()
  t.repeat.set(-1, 1)
  t.offset.set(1, 0)
  return t
}

/** The back of a postcard, for a photo: a line down the middle, lines to write the address on and a box for the stamp. */
function postcard(aspect: number): CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.height = 512
  canvas.width = Math.round(512 * aspect)
  const { width: w, height: h } = canvas
  const g = canvas.getContext("2d")!
  g.fillStyle = CARD
  g.fillRect(0, 0, w, h)
  g.strokeStyle = "#b9b0a0"
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(w * 0.55, h * 0.1)
  g.lineTo(w * 0.55, h * 0.9)
  for (const y of [0.5, 0.62, 0.74, 0.86]) {
    g.moveTo(w * 0.6, h * y)
    g.lineTo(w * 0.94, h * y)
  }
  g.stroke()
  g.setLineDash([8, 6])
  g.strokeRect(w * 0.94 - h * 0.22, h * 0.08, h * 0.22, h * 0.26)
  g.fillStyle = "#8a8072"
  g.font = `600 ${Math.round(h * 0.07)}px system-ui, sans-serif`
  g.fillText("Where is this?", w * 0.06, h * 0.18)
  g.font = `${Math.round(h * 0.045)}px system-ui, sans-serif`
  g.fillText("Whereabouts", w * 0.06, h * 0.9)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 16
  return t
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
