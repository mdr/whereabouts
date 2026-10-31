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
import { headsetPassthrough, soundOn } from "../settings"
import type { VrAction, VrView } from "./view"
import panelUrl from "./panel.uikitml?url"

export const PANEL_M = 0.38
const HEADINGS: Record<VrView["kind"], string> = {
  lobby: "WELCOME",
  paint: "THIS ROUND",
  reveal: "THE ANSWER",
  done: "GAME OVER"
}
/** As many as the menu has buttons for, below the main actions. */
const MORE = 4
/** How long a press waits for its confirming second press. */
export const CONFIRM_S = 4

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
  private armed: { action: VrAction; until: number } | undefined = undefined
  private now = 0
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
    const obj = this.object3D
    const level = new Vector3(forward.x, 0, forward.z).normalize()
    const left = new Vector3(level.z, 0, -level.x)
    obj.position
      .copy(head)
      .addScaledVector(level, 0.55)
      .addScaledVector(left, 0.5)
      .add(new Vector3(0, -0.1, 0))
    obj.lookAt(head)
  }

  /** The menu loads on its own time; hook its buttons up once it has. */
  wirePanel(): void {
    if (this.doc || !this.entity.hasComponent(PanelDocument)) return
    this.wire(PanelDocument.data.document[this.entity.index] as UIKitDocument)
  }

  wire(doc: UIKitDocument): void {
    this.doc = doc
    doc.setTargetDimensions(PANEL_M, PANEL_M)
    const on = (id: string, f: () => void) =>
      doc.requireElementById(id).addEventListener("click", () => {
        this.handlers.clicked()
        f()
      })
    on("done", () => this.handlers.done())
    on("unlock", () => this.view?.kind === "paint" && this.view.round.unlock?.())
    for (const i of [0, 1]) on(`act${i}`, () => this.press(this.actions[i]))
    for (let i = 0; i < MORE; i++) on(`more${i}`, () => this.press(this.view?.more?.[i]))
    on("sound", () => {
      soundOn.value = !soundOn.value
      this.applyView()
    })
    on("flags", () => this.view?.kind === "reveal" && this.view.reveal.flags?.toggle())
    on("passthrough", () => this.handlers.togglePassthrough())
    on("exit", () => this.handlers.exit())
    this.applyView()
  }

  /** A new screen; a press waiting for its second press was for the screen it was on. */
  show(view: VrView): void {
    if (view.kind !== this.view?.kind) this.armed = undefined
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

  offerPassthrough(ok: boolean): void {
    this.passthroughOffered = ok
    this.applyView()
  }

  tick(now: number): void {
    this.now = now
    if (this.armed && now > this.armed.until) {
      this.armed = undefined
      this.applyView()
    }
  }

  /** Done says Pass with nothing painted, and the clock counts down. */
  updateLabels(): void {
    const doc = this.doc
    if (!doc || this.view?.kind !== "paint") return
    const { round } = this.view
    const done = round.paint.layer.isEmpty ? "Pass" : round.doneLabel
    if (done !== this.doneText) {
      this.doneText = done
      doc.getElementById("doneLabel")?.setProperties({ text: done })
    }
    if (!round.msLeft) return
    const s = Math.ceil(Math.max(0, round.msLeft()) / 1000)
    const clock = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left` : "Time's up"
    if (clock !== this.clockText) {
      this.clockText = clock
      doc.getElementById("clock")?.setProperties({ text: clock })
    }
  }

  buttonAt(id: string): [number, number, number] {
    const p = this.doc!.requireElementById(id).getWorldPosition(new Vector3())
    return [p.x, p.y, p.z]
  }

  get shown(): MenuShown {
    const view = this.view
    const round = view?.kind === "paint" ? view.round : undefined
    const shown = (a: VrAction) => ({ label: this.label(a), enabled: a.enabled !== false })
    return {
      done: this.doneText,
      clock: this.clockText,
      unlock: round?.unlock !== undefined,
      actions: this.actions.map(shown),
      more: (view?.more ?? []).slice(0, MORE).map(shown),
      heading: view ? this.heading(view) : "",
      mode: round?.mode,
      note: view && this.note(view)
    }
  }

  /** An action asking for confirmation waits for a second press. */
  private press(action: VrAction | undefined): void {
    if (!action || action.enabled === false) return
    if (action.confirm && this.armed?.action.label !== action.label) {
      this.armed = { action, until: this.now + CONFIRM_S }
      this.applyView()
      return
    }
    this.armed = undefined
    action.press()
  }

  private label(action: VrAction): string {
    return this.armed?.action.label === action.label && action.confirm ? action.confirm : action.label
  }

  private heading(view: VrView): string {
    return (view.kind === "paint" && view.round.heading) || HEADINGS[view.kind]
  }

  private note(view: VrView): string | undefined {
    return view.kind === "paint" ? view.round.note : view.kind === "reveal" ? view.reveal.note : view.summary.note
  }

  private get actions(): VrAction[] {
    const view = this.view
    return view?.kind === "reveal" ? view.reveal.actions : view && "summary" in view ? view.summary.actions : []
  }

  private applyView(): void {
    const doc = this.doc
    const view = this.view
    if (!doc || !view) return
    const show = (id: string, on: boolean) => doc.getElementById(id)?.setProperties({ display: on ? "flex" : "none" })
    const text = (id: string, t: string) => doc.getElementById(id)?.setProperties({ text: t })
    const reveal = view.kind === "reveal" ? view.reveal : undefined
    const summary = "summary" in view ? view.summary : undefined
    const round = view.kind === "paint" ? view.round : undefined
    const painting = round?.playing === true && round.unlock === undefined
    show("hint", painting)
    text(
      "hint",
      round?.paint.fillable.value
        ? "Turn your left palm up for paint tools and hints. A or X brings out the fill pail: a pull fills the country it points at."
        : "Turn your left palm up for paint tools and hints."
    )
    show("mode", round?.mode !== undefined)
    if (round?.mode) text("mode", round.mode)
    show("done", painting)
    show("unlock", round?.unlock !== undefined)
    show("clock", round?.msLeft !== undefined)
    show("score", round === undefined)
    const note = this.note(view)
    show("note", note !== undefined)
    if (note !== undefined) text("note", note)
    const actions = this.actions
    for (const i of [0, 1]) {
      const action = actions[i]
      show(`act${i}`, action !== undefined)
      if (!action) continue
      text(`act${i}Label`, this.label(action))
      doc.getElementById(`act${i}`)?.setProperties({ disabled: action.enabled === false })
    }
    const more = view.more ?? []
    show("more", more.length > 0)
    for (let i = 0; i < MORE; i++) {
      const action = more[i]
      show(`more${i}`, action !== undefined)
      if (!action) continue
      text(`more${i}Label`, this.label(action))
      doc.getElementById(`more${i}`)?.setProperties({ disabled: action.enabled === false })
    }
    text("soundLabel", soundOn.value ? "Sound on" : "Sound off")
    show("passthrough", this.passthroughOffered)
    text("heading", this.heading(view))
    show("extras", reveal?.flags !== undefined)
    text("passthroughLabel", headsetPassthrough.value ? "Show space" : "See your room")
    if (reveal?.flags) text("flagsLabel", reveal.flags.on ? "Hide all flags" : "Show all flags")
    if (round) text("prompt", round.prompt)
    show("fact", reveal?.fact !== undefined)
    if (reveal) {
      text("prompt", reveal.label)
      text("score", reveal.scoreLine)
      if (reveal.fact !== undefined) text("fact", reveal.fact)
    }
    if (summary) {
      text("prompt", summary.title)
      text("score", summary.scoreLine)
    }
    // Set again from the round next frame.
    this.doneText = this.clockText = ""
  }
}
