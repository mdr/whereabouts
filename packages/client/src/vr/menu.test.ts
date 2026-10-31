// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { Group, type UIKitDocument, type World } from "@iwsdk/core"
import { CONFIRM_S, Menu } from "./menu"
import type { VrAction, VrRound, VrView } from "./view"

function makeMenu() {
  const world = {
    createTransformEntity: () => ({ addComponent() {}, object3D: new Group() })
  } as unknown as World
  const menu = new Menu(world, { clicked() {}, done() {}, togglePassthrough() {}, exit() {} })
  const clicks = new Map<string, () => void>()
  menu.wire({
    setTargetDimensions() {},
    requireElementById: (id: string) => ({ addEventListener: (_: string, f: () => void) => clicks.set(id, f) }),
    getElementById: () => ({ setProperties() {} })
  } as unknown as UIKitDocument)
  return { menu, click: (id: string) => clicks.get(id)!() }
}

function makeAction(over: Partial<VrAction> = {}): { action: VrAction; press: () => void } {
  const press = vi.fn()
  return { action: { label: "Leave game", press, ...over }, press }
}

function makeLobby(actions: VrAction[]): VrView {
  return { kind: "lobby", summary: { title: "Whereabouts", scoreLine: "", actions } }
}

function makeRound(over: Partial<VrRound> = {}): VrRound {
  return {
    paint: { layer: { isEmpty: true }, fillable: { value: false } },
    prompt: "Where is Paris?",
    detail: "plain",
    picture: undefined,
    water: false,
    hint: undefined,
    hintsLeft: "none",
    useHint() {},
    doneLabel: "Submit",
    done() {},
    playing: true,
    ...over
  } as VrRound
}

function makeReveal(actions: VrAction[]): VrView {
  return {
    kind: "reveal",
    round: makeRound(),
    reveal: {
      label: "Paris",
      answer: { point: { lat: 48.9, lon: 2.4 } },
      focus: { lat: 48.9, lon: 2.4 },
      stateRound: false,
      scoreLine: "",
      actions
    }
  }
}

function shownWith(menu: Menu, view: VrView) {
  menu.show(view)
  menu.refresh(view)
}

describe("the VR menu", () => {
  it("presses an action at once when it needs no confirming", () => {
    const { menu, click } = makeMenu()
    const { action, press } = makeAction()
    shownWith(menu, makeLobby([action]))
    click("act0")
    expect(press).toHaveBeenCalledOnce()
  })

  it("asks for a second press, within the window, before an action that needs confirming", () => {
    const { menu, click } = makeMenu()
    const { action, press } = makeAction({ confirm: "Sure? Press again" })
    shownWith(menu, makeLobby([action]))
    click("act0")
    expect(press).not.toHaveBeenCalled()
    expect(menu.shown.actions[0]!.label).toBe("Sure? Press again")
    menu.tick(CONFIRM_S - 0.5)
    click("act0")
    expect(press).toHaveBeenCalledOnce()
    expect(menu.shown.actions[0]!.label).toBe("Leave game")
  })

  it("forgets a first press once the window has passed", () => {
    const { menu, click } = makeMenu()
    const { action, press } = makeAction({ confirm: "Sure?" })
    shownWith(menu, makeLobby([action]))
    click("act0")
    menu.tick(CONFIRM_S + 0.5)
    expect(menu.shown.actions[0]!.label).toBe("Leave game")
    click("act0")
    expect(press).not.toHaveBeenCalled()
  })

  it("forgets a first press when the screen changes, but not when the same screen updates", () => {
    const { menu, click } = makeMenu()
    const { action, press } = makeAction({ confirm: "Sure?" })
    shownWith(menu, makeLobby([action]))
    click("act0")
    shownWith(menu, makeLobby([action]))
    expect(menu.shown.actions[0]!.label).toBe("Sure?")
    shownWith(menu, makeReveal([action]))
    expect(menu.shown.actions[0]!.label).toBe("Leave game")
    click("act0")
    expect(press).not.toHaveBeenCalled()
  })

  it("forgets a first press when the player leaves VR", () => {
    const { menu, click } = makeMenu()
    const { action, press } = makeAction({ confirm: "Sure?" })
    const view = makeLobby([action])
    shownWith(menu, view)
    click("act0")
    menu.leave()
    shownWith(menu, view)
    click("act0")
    expect(press).not.toHaveBeenCalled()
  })

  it("ignores a disabled action", () => {
    const { menu, click } = makeMenu()
    const { action, press } = makeAction({ enabled: false })
    shownWith(menu, makeLobby([action]))
    click("act0")
    expect(press).not.toHaveBeenCalled()
  })

  it("calls Done Pass with nothing painted, and counts the clock down", () => {
    const { menu } = makeMenu()
    shownWith(menu, { kind: "paint", round: makeRound({ msLeft: () => 65_000 }) })
    menu.updateLabels()
    expect(menu.shown).toMatchObject({ done: "Pass", clock: "1:05 left" })
    shownWith(menu, { kind: "paint", round: makeRound({ msLeft: () => 0 }) })
    menu.updateLabels()
    expect(menu.shown.clock).toBe("Time's up")
  })
})
