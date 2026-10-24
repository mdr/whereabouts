/**
 * The page's other paint tools, over the left hand: it shows while the left
 * palm is turned up, and the right hand's ray presses it. Up rather than
 * towards the eyes: aiming the eraser across the body turns the palm to them.
 */
import {
  Group,
  Hovered,
  PanelDocument,
  PanelUI,
  RayInteractable,
  Vector3,
  type Entity,
  type Object3D,
  type UIKitDocument,
  type World
} from "@iwsdk/core"
import wristUrl from "./wrist.uikitml?url"

export type WristButton = "latitude" | "longitude" | "trim" | "trimHint" | "clear" | "redo"

const WRIST_M = 0.2
/** How squarely the palm must face up to open the menu, and how far it may turn away before it shuts. */
const OPEN = 0.6
const STAY_OPEN = 0.35
const NOTE_S = 2.5

const at = new Vector3()
const palm = new Vector3()
const up = new Vector3(0, 1, 0)

function hintOffer(left: number | "unlimited" | "none"): string {
  if (left === "unlimited") return "Hint, as many as you like in practice: a band the answer lies in"
  if (left === "none") return "This game has no hints"
  if (left === 0) return "No hints left this game"
  return `Hint: a band the answer lies in. ${left} left this game`
}

export class WristMenu {
  private readonly entity: Entity
  private readonly handlers: Record<WristButton, () => void>
  private doc: UIKitDocument | undefined = undefined
  private shown = false
  private noteText = ""
  private noteTimer: ReturnType<typeof setTimeout> | undefined = undefined
  private state: { water: boolean; hint: string | undefined; left: number | "unlimited" | "none" } = {
    water: false,
    hint: undefined,
    left: "unlimited"
  }

  constructor(world: World, handlers: Record<WristButton, () => void>) {
    this.handlers = handlers
    this.entity = world.createTransformEntity(new Group(), { persistent: true })
    this.entity.addComponent(PanelUI, { config: wristUrl })
    this.entity.object3D!.visible = false
  }

  get open(): boolean {
    return this.shown
  }

  get hovered(): boolean {
    return this.shown && this.entity.hasComponent(Hovered)
  }

  /** `grip`: the left hand's grip space; for the left hand its +X comes out of the palm. */
  update(enabled: boolean, grip: Object3D, eyes: Vector3): void {
    this.wire()
    grip.getWorldPosition(at)
    palm.set(1, 0, 0).transformDirection(grip.matrixWorld)
    const facing = palm.dot(up)
    const show = enabled && facing > (this.shown ? STAY_OPEN : OPEN)
    if (show !== this.shown) {
      this.shown = show
      this.entity.object3D!.visible = show
      // The ray finds a panel whether or not it shows.
      if (show) this.entity.addComponent(RayInteractable)
      else this.entity.removeComponent(RayInteractable)
    }
    if (!show) return
    const obj = this.entity.object3D!
    obj.position.copy(at).addScaledVector(palm, 0.07).addScaledVector(up, 0.04)
    obj.lookAt(eyes)
  }

  /** `hint`: the band used this round, in words. `left`: how many more hints there are. */
  setState(water: boolean, hint: string | undefined, left: number | "unlimited" | "none"): void {
    const s = this.state
    if (s.water === water && s.hint === hint && s.left === left) return
    this.state = { water, hint, left }
    this.apply()
  }

  /** Says what a button did, for a moment. */
  note(text: string): void {
    this.noteText = text
    clearTimeout(this.noteTimer)
    this.noteTimer = setTimeout(() => {
      this.noteText = ""
      this.apply()
    }, NOTE_S * 1000)
    this.apply()
  }

  /** Where a button is, for the browser tests. */
  buttonAt(id: WristButton): [number, number, number] {
    const p = this.doc!.requireElementById(id).getWorldPosition(new Vector3())
    return [p.x, p.y, p.z]
  }

  /** The menu loads on its own time; hook its buttons up once it has. */
  private wire(): void {
    if (this.doc || !this.entity.hasComponent(PanelDocument)) return
    const doc = PanelDocument.data.document[this.entity.index] as UIKitDocument
    this.doc = doc
    doc.setTargetDimensions(WRIST_M, WRIST_M)
    for (const [id, f] of Object.entries(this.handlers)) doc.requireElementById(id).addEventListener("click", f)
    this.apply()
  }

  private apply(): void {
    const doc = this.doc
    if (!doc) return
    const { water, hint, left } = this.state
    const show = (id: string, on: boolean) => doc.getElementById(id)?.setProperties({ display: on ? "flex" : "none" })
    const text = (id: string, t: string) => doc.getElementById(id)?.setProperties({ text: t })
    show("hints", hint === undefined && left !== 0 && left !== "none")
    show("trimHint", hint !== undefined)
    text("trimLabel", water ? "Trim land" : "Trim sea")
    text("note", this.noteText || (hint ?? hintOffer(left)))
  }
}
