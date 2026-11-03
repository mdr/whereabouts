/**
 * The question's photo or flag, on a card above the VR menu. A grip on it
 * takes it in hand, facing the player, for a closer look; letting go puts
 * it back. Turned over, a flag shows its reverse and a photo a postcard's
 * back.
 */
import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { reportClientError } from "../../net/client-error/report-client-error"
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
import { VR_PHOTO_SIZE, vrPhotoUrl, type Postcard, type VrPicture, VrPictureType } from "./vr-picture"
import { flagRatio, flagUrl } from "../../flags/flags"
import type { Hand } from "../hands/hand"
import { PictureBack } from "./picture-back"
import type { Metres } from "@whereabouts/shared/units"

const MAX_WIDTH: Metres = 0.38
const MAX_HEIGHT: Metres = 0.26
/** How close a hand need be to take the picture without pointing at it. */
const REACH: Metres = 0.08
/** A card's thickness, so it has an edge when turned. */
const THICKNESS: Metres = 0.003
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
  private shownBack: PictureBack | undefined = undefined
  private shownPostcard: Postcard | undefined = undefined

  constructor() {
    const edge = new MeshBasicMaterial({ color: CARD })
    this.mesh = new Mesh(new BoxGeometry(1, 1, THICKNESS), [
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
  get back(): PictureBack | undefined {
    return this.mesh.visible ? this.shownBack : undefined
  }

  /** The place its postcard back names, for the browser tests. */
  get postcardPlace(): string | undefined {
    return this.mesh.visible ? this.shownPostcard?.place : undefined
  }

  get height(): number {
    return this.mesh.visible ? this.mesh.scale.y : 0
  }

  get heldBy(): Hand | undefined {
    return this.held
  }

  /** Whether a hand at `grip`, pointing from `origin` along `direction`, is on the picture. */
  reaches(grip: Vector3, origin: Vector3, direction: Vector3): boolean {
    if (!this.mesh.visible) return false
    raycaster.set(origin, direction)
    if (raycaster.intersectObject(this.mesh).length > 0) return true
    const size = Math.max(this.mesh.scale.x, this.mesh.scale.y) / 2
    return this.mesh.getWorldPosition(at).distanceTo(grip) < size + REACH
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
      (image) => {
        if (asked !== this.asked || !image) return
        // A flag's SVG has no size of its own.
        const [width, height] =
          picture.type === VrPictureType.FLAG ? [flagRatio(picture.flag), 1] : [image.naturalWidth, image.naturalHeight]
        const fit = Math.min(VR_PHOTO_SIZE / width, VR_PHOTO_SIZE / height)
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(width * fit)
        canvas.height = Math.round(height * fit)
        canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height)
        // A new texture each time: one already on the GPU keeps its first size.
        const texture = new CanvasTexture(canvas)
        texture.colorSpace = SRGBColorSpace
        // Sharp when tilted too; three caps it at what the GPU allows.
        texture.anisotropy = 16
        const back =
          picture.type === VrPictureType.FLAG
            ? reverse(texture)
            : postcard(canvas.width / canvas.height, picture.postcard)
        for (const [i, map] of [
          [FRONT, texture],
          [BACK, back]
        ] as const) {
          const material = this.mesh.material[i]!
          material.map?.dispose()
          material.map = map
          material.needsUpdate = true
        }
        this.shownBack = picture.type === VrPictureType.FLAG ? PictureBack.REVERSE : PictureBack.POSTCARD
        this.shownPostcard = picture.type === VrPictureType.FLAG ? undefined : picture.postcard
        const size = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
        this.mesh.scale.set(width * size, height * size, 1)
        this.mesh.visible = true
      },
      (error: unknown) => {
        console.warn("could not load the picture for VR", error)
        reportClientError(ClientErrorKind.VR_LOAD, error)
      }
    )
  }
}

/** A flag seen from behind: the same, mirrored. */
const reverse = (front: CanvasTexture): CanvasTexture => {
  const flipped = front.clone()
  flipped.repeat.set(-1, 1)
  flipped.offset.set(1, 0)
  return flipped
}

/**
 * The back of a postcard, for a photo: a line down the middle, lines to
 * write the address on and a box for the stamp. At the reveal, the message
 * names the place and tells of it.
 */
const postcard = (aspect: number, message: Postcard | undefined): CanvasTexture => {
  const canvas = document.createElement("canvas")
  canvas.height = 512
  canvas.width = Math.round(512 * aspect)
  const { width, height } = canvas
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = CARD
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = "#b9b0a0"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(width * 0.55, height * 0.1)
  ctx.lineTo(width * 0.55, height * 0.9)
  for (const y of [0.5, 0.62, 0.74, 0.86]) {
    ctx.moveTo(width * 0.6, height * y)
    ctx.lineTo(width * 0.94, height * y)
  }
  ctx.stroke()
  ctx.setLineDash([8, 6])
  ctx.strokeRect(width * 0.94 - height * 0.22, height * 0.08, height * 0.22, height * 0.26)
  ctx.fillStyle = "#8a8072"
  ctx.font = `600 ${Math.round(height * 0.07)}px system-ui, sans-serif`
  if (!message) ctx.fillText("Where is this?", width * 0.06, height * 0.18)
  else {
    const textWidth = width * 0.45
    const lines = wrap(ctx, `Greetings from ${message.place}!`, textWidth)
    ctx.fillStyle = "#4a443c"
    lines.forEach((line, i) => ctx.fillText(line, width * 0.06, height * (0.18 + i * 0.09)))
    if (message.text) {
      const top = height * (0.2 + lines.length * 0.09)
      // Smaller for a long fact on a narrow card, to stay clear of the name at the foot.
      let size = Math.round(height * 0.052)
      let text: string[]
      for (;;) {
        ctx.font = `italic ${size}px system-ui, sans-serif`
        text = wrap(ctx, message.text, textWidth)
        if (top + text.length * size * 1.3 <= height * 0.82 || size <= height * 0.032) break
        size--
      }
      ctx.fillStyle = "#5c554b"
      text.forEach((line, i) => ctx.fillText(line, width * 0.06, top + i * size * 1.3))
    }
    ctx.fillStyle = "#8a8072"
  }
  ctx.font = `${Math.round(height * 0.045)}px system-ui, sans-serif`
  ctx.fillText("Whereabouts", width * 0.06, height * 0.9)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 16
  return texture
}

/** `text` broken into lines no wider than `width` in the canvas's current font. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number): string[] => {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(" ")) {
    const longer = line ? `${line} ${word}` : word
    if (line && ctx.measureText(longer).width > width) {
      lines.push(line)
      line = word
    } else line = longer
  }
  if (line) lines.push(line)
  return lines
}

const load = async (picture: VrPicture): Promise<HTMLImageElement | undefined> => {
  const url = picture.type === VrPictureType.FLAG ? await flagUrl(picture.flag) : await vrPhotoUrl(picture.photo)
  if (!url) return undefined
  const image = new Image()
  image.crossOrigin = "anonymous"
  image.src = url
  await image.decode()
  return image
}
