/**
 * The menu panel to the left of the globe: the question, Done and the clock
 * while painting, then the score and what to do next.
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
import { headsetPassthrough, soundOn } from "../../settings/settings"
import { MORE, actionLabel, panelContent, viewActions, viewHeading, viewNote, type PanelElement } from "./menu-panel"
import { VrViewType, type VrAction, type VrView } from "../view/view"
import panelUrl from "./panel.uikitml?url"
import type { Metres, Seconds } from "@whereabouts/shared/units"
import type { Vec3 } from "../probe"

export const PANEL_SIZE: Metres = 0.38
/** How long a press waits for its confirming second press. */
export const CONFIRM_WAIT: Seconds = 4

export interface MenuHandlers {
  /** Any of its buttons clicked. */
  clicked(): void
  done(): void
  togglePassthrough(): void
  exit(): void
}

export interface MenuShown {
  done: string
  clock: string
  unlock: boolean
  actions: { label: string; enabled: boolean }[]
  more: { label: string; enabled: boolean }[]
  heading: string
  mode: string | undefined
  note: string | undefined
}

export class Menu {
  readonly entity: Entity
  private doc: UIKitDocument | undefined = undefined
  private view: VrView | undefined = undefined
  /** An action pressed once, waiting for its confirming press until `until`. */
  private armed: { action: VrAction; until: Seconds } | undefined = undefined
  private now: Seconds = 0
  /** What the menu last said, so it is set only when it changes. */
  private doneText = ""
  private clockText = ""
  /** Whether the headset can show the room (immersive-ar), once asked. */
  private passthroughOffered = false
  private readonly handlers: MenuHandlers

  constructor(world: World, handlers: MenuHandlers) {
    this.handlers = handlers
    this.entity = world.createTransformEntity(new Group(), { persistent: true })
    this.entity.addComponent(RayInteractable)
    this.entity.addComponent(PanelUI, { config: panelUrl })
  }

  get object3D(): Object3D {
    return this.entity.object3D!
  }

  get hovered(): boolean {
    return this.entity.hasComponent(Hovered)
  }

  /** Its size in its own units, once it has loaded. */
  get size(): { width: number; height: number } | undefined {
    return this.doc?.computedSize ?? undefined
  }

  /** To the left of the globe, turned to face the player. */
  place(head: Vector3, forward: Vector3): void {
    const object = this.object3D
    const level = new Vector3(forward.x, 0, forward.z).normalize()
    const left = new Vector3(level.z, 0, -level.x)
    object.position
      .copy(head)
      .addScaledVector(level, 0.55)
      .addScaledVector(left, 0.5)
      .add(new Vector3(0, -0.1, 0))
    object.lookAt(head)
  }

  /** The menu loads on its own time; hook its buttons up once it has. */
  wirePanel(): void {
    if (this.doc || !this.entity.hasComponent(PanelDocument)) return
    this.wire(PanelDocument.data.document[this.entity.index] as UIKitDocument)
  }

  wire(doc: UIKitDocument): void {
    this.doc = doc
    doc.setTargetDimensions(PANEL_SIZE, PANEL_SIZE)
    const on = (id: string, handler: () => void): void =>
      doc.requireElementById(id).addEventListener("click", () => {
        this.handlers.clicked()
        handler()
      })
    on("done", () => this.handlers.done())
    on("unlock", () => this.view?.type === VrViewType.PAINT && this.view.round.unlock?.())
    for (const i of [0, 1]) on(`act${i}`, () => this.press(viewActions(this.view)[i]))
    for (let i = 0; i < MORE; i++) on(`more${i}`, () => this.press(this.view?.more?.[i]))
    on("sound", () => {
      soundOn.value = !soundOn.value
      this.applyView()
    })
    on("flags", () => this.view?.type === VrViewType.REVEAL && this.view.reveal.flags?.toggle())
    on("passthrough", () => this.handlers.togglePassthrough())
    on("exit", () => this.handlers.exit())
    this.applyView()
  }

  /** A new screen; a press waiting for its second press was for the screen it was on. */
  show(view: VrView): void {
    if (view.type !== this.view?.type) this.armed = undefined
    this.view = view
  }

  refresh(view: VrView): void {
    this.view = view
    this.applyView()
  }

  leave(): void {
    this.armed = undefined
    this.view = undefined
  }

  offerPassthrough(supported: boolean): void {
    this.passthroughOffered = supported
    this.applyView()
  }

  tick(now: Seconds): void {
    this.now = now
    if (this.armed && now > this.armed.until) {
      this.armed = undefined
      this.applyView()
    }
  }

  /** Done says Pass with nothing painted, and the clock counts down. */
  updateLabels(): void {
    const doc = this.doc
    if (!doc || this.view?.type !== VrViewType.PAINT) return
    const { round } = this.view
    const done = round.paint.layer.isEmpty ? "Pass" : round.doneLabel
    if (done !== this.doneText) {
      this.doneText = done
      doc.getElementById("doneLabel")?.setProperties({ text: done })
    }
    if (!round.timeLeft) return
    const seconds = Math.ceil(Math.max(0, round.timeLeft()) / 1000)
    const clock =
      seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left` : "Time's up"
    if (clock !== this.clockText) {
      this.clockText = clock
      doc.getElementById("clock")?.setProperties({ text: clock })
    }
  }

  buttonAt(id: string): Vec3 {
    const position = this.doc!.requireElementById(id).getWorldPosition(new Vector3())
    return [position.x, position.y, position.z]
  }

  get shown(): MenuShown {
    const view = this.view
    const round = view?.type === VrViewType.PAINT ? view.round : undefined
    const shown = (action: VrAction): { label: string; enabled: boolean } => ({
      label: actionLabel(action, this.armed?.action),
      enabled: action.enabled !== false
    })
    return {
      done: this.doneText,
      clock: this.clockText,
      unlock: round?.unlock !== undefined,
      actions: viewActions(view).map(shown),
      more: (view?.more ?? []).slice(0, MORE).map(shown),
      heading: view ? viewHeading(view) : "",
      mode: round?.mode,
      note: view && viewNote(view)
    }
  }

  /** An action asking for confirmation waits for a second press. */
  private press(action: VrAction | undefined): void {
    if (!action || action.enabled === false) return
    if (action.confirm && this.armed?.action.label !== action.label) {
      this.armed = { action, until: this.now + CONFIRM_WAIT }
      this.applyView()
      return
    }
    this.armed = undefined
    action.press()
  }

  private applyView(): void {
    const doc = this.doc
    const view = this.view
    if (!doc || !view) return
    const content = panelContent(view, {
      armed: this.armed?.action,
      soundOn: soundOn.value,
      passthroughOn: headsetPassthrough.value,
      passthroughOffered: this.passthroughOffered
    })
    for (const [id, element] of Object.entries(content)) doc.getElementById(id)?.setProperties(uikitProperties(element))
    // Set again from the round next frame.
    this.doneText = this.clockText = ""
  }
}

const uikitProperties = ({
  shown,
  text,
  disabled
}: PanelElement): {
  disabled?: boolean | undefined
  text?: string | undefined
  display?: "none" | "flex" | undefined
} => ({
  ...(shown !== undefined && { display: shown ? ("flex" as const) : ("none" as const) }),
  ...(text !== undefined && { text }),
  ...(disabled !== undefined && { disabled })
})
