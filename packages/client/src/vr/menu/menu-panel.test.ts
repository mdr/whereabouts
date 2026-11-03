import { describe, expect, it } from "vite-plus/test"
import { FillType } from "../../paint/fill-target"
import type { PaintController } from "../../paint/paint-controller"
import { panelContent, type PanelState } from "./menu-panel"
import {
  HintAllowance,
  VrAnswerType,
  VrPaintsType,
  VrViewType,
  type VrAction,
  type VrReveal,
  type VrRound,
  type VrView
} from "../view/view"

const makeState = (
  over: Partial<PanelState> = {}
): { armed: VrAction | undefined; soundOn: boolean; passthroughOn: boolean; passthroughOffered: boolean } => ({
  armed: undefined,
  soundOn: true,
  passthroughOn: false,
  passthroughOffered: false,
  ...over
})

const makeAction = (over: Partial<VrAction> = {}): VrAction => ({ label: "Next", press() {}, ...over })

const makeRound = (over: Partial<VrRound> = {}): VrRound =>
  ({
    paint: { layer: { isEmpty: true }, fillable: { value: false }, fillType: { value: undefined } },
    prompt: "Where is Paris?",
    detail: "plain",
    picture: undefined,
    water: false,
    hint: undefined,
    hintsLeft: HintAllowance.NONE,
    useHint() {},
    doneLabel: "Submit",
    done() {},
    playing: true,
    ...over
  }) as VrRound

const makePaint = (round: Partial<VrRound> = {}, more?: VrAction[]): VrView => ({
  type: VrViewType.PAINT,
  round: makeRound(round),
  more
})

const makeReveal = (reveal: Partial<VrReveal> = {}, more?: VrAction[]): VrView => ({
  type: VrViewType.REVEAL,
  round: makeRound(),
  reveal: {
    label: "Paris",
    answer: { type: VrAnswerType.POINT, point: { lat: 48.9, lon: 2.4 } },
    focus: { lat: 48.9, lon: 2.4 },
    stateRound: false,
    scoreLine: "90 points",
    paints: { type: VrPaintsType.OWN },
    actions: [],
    ...reveal
  },
  more
})

const makeLobby = (actions: VrAction[] = [], more?: VrAction[]): VrView => ({
  type: VrViewType.LOBBY,
  summary: { title: "Whereabouts", scoreLine: "3 players", actions },
  more
})

describe("panelContent", () => {
  it("shows the hint and Done while painting, and the question", () => {
    const content = panelContent(makePaint(), makeState())
    expect(content["hint"]?.shown).toBe(true)
    expect(content["done"]).toEqual({ shown: true })
    expect(content["score"]).toEqual({ shown: false })
    expect(content["fact"]).toEqual({ shown: false })
    expect(content["prompt"]).toEqual({ text: "Where is Paris?" })
  })

  it("mentions the fill pail, and what it fills, when the round can fill", () => {
    const paint = (fillType: FillType): PaintController =>
      ({ layer: { isEmpty: true }, fillable: { value: true }, fillType: { value: fillType } }) as PaintController
    const hint = (fillType: FillType): string | undefined =>
      panelContent(makePaint({ paint: paint(fillType) }), makeState())["hint"]?.text
    expect(hint(FillType.COUNTRY)).toContain("fills the country it points at")
    expect(hint(FillType.ISLAND)).toContain("fills the island it points at")
    expect(panelContent(makePaint(), makeState())["hint"]?.text).not.toContain("fill pail")
  })

  it("shows Unlock instead of Done and the hint once done in a game", () => {
    const content = panelContent(makePaint({ unlock() {} }), makeState())
    expect(content["done"]).toEqual({ shown: false })
    expect(content["hint"]?.shown).toBe(false)
    expect(content["unlock"]).toEqual({ shown: true })
  })

  it("hides the mode, with no text, when the round has none", () => {
    expect(panelContent(makePaint(), makeState())["mode"]).toEqual({ shown: false })
    expect(panelContent(makePaint({ mode: "Paint the shape" }), makeState())["mode"]).toEqual({
      shown: true,
      text: "Paint the shape"
    })
  })

  it("shows the answer's label and score on a reveal, and the fact if there is one", () => {
    const content = panelContent(makeReveal({ fact: "On the Seine" }), makeState())
    expect(content["prompt"]).toEqual({ text: "Paris" })
    expect(content["score"]).toEqual({ shown: true, text: "90 points" })
    expect(content["fact"]).toEqual({ shown: true, text: "On the Seine" })
    expect(panelContent(makeReveal(), makeState())["fact"]).toEqual({ shown: false })
  })

  it("offers the flags toggle on a flag round only", () => {
    const flags = { on: true, toggle() {}, pins: undefined }
    const content = panelContent(makeReveal({ flags }), makeState())
    expect(content["extras"]).toEqual({ shown: true })
    expect(content["flagsLabel"]).toEqual({ text: "Hide all flags" })
    const without = panelContent(makeReveal(), makeState())
    expect(without["extras"]).toEqual({ shown: false })
    expect(without).not.toHaveProperty("flagsLabel")
  })

  it("shows the summary title and score line in the lobby", () => {
    const content = panelContent(makeLobby(), makeState())
    expect(content["prompt"]).toEqual({ text: "Whereabouts" })
    expect(content["score"]).toEqual({ shown: true, text: "3 players" })
  })

  it("hides buttons without an action, and sets no label for them", () => {
    const content = panelContent(makeLobby([makeAction()]), makeState())
    expect(content["act0"]).toEqual({ shown: true, disabled: false })
    expect(content["act0Label"]).toEqual({ text: "Next" })
    expect(content["act1"]).toEqual({ shown: false })
    expect(content).not.toHaveProperty("act1Label")
  })

  it("disables a button whose action is disabled", () => {
    expect(panelContent(makeLobby([makeAction({ enabled: false })]), makeState())["act0"]?.disabled).toBe(true)
  })

  it("labels an armed action with its confirmation", () => {
    const action = makeAction({ confirm: "Sure?" })
    expect(panelContent(makeLobby([action]), makeState({ armed: action }))["act0Label"]).toEqual({ text: "Sure?" })
  })

  it("hides the more container when there is nothing more", () => {
    expect(panelContent(makeLobby(), makeState())["more"]).toEqual({ shown: false })
    const content = panelContent(makeLobby([], [makeAction({ label: "Leave" })]), makeState())
    expect(content["more"]).toEqual({ shown: true })
    expect(content["more0Label"]).toEqual({ text: "Leave" })
  })
})
