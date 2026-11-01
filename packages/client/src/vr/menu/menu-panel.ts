/** What the menu panel shows for a view, keyed by element id from panel.uikitml. */
import { VrViewType, type VrAction, type VrReveal, type VrRound, type VrView } from "../view/view"

/** As many as the menu has buttons for, below the main actions. */
export const MORE = 4

const HEADINGS: Record<VrViewType, string> = {
  [VrViewType.LOBBY]: "WELCOME",
  [VrViewType.PAINT]: "THIS ROUND",
  [VrViewType.REVEAL]: "THE ANSWER",
  [VrViewType.DONE]: "GAME OVER"
}

/** One element's settings; a field left out is left as it was. */
export interface PanelElement {
  shown?: boolean
  text?: string
  disabled?: boolean
}

interface PanelState {
  armed: VrAction | undefined
  soundOn: boolean
  passthroughOn: boolean
  passthroughOffered: boolean
}

type PanelContent = Record<string, PanelElement>

export const viewHeading = (view: VrView): string =>
  (view.type === VrViewType.PAINT && view.round.heading) || HEADINGS[view.type]

export const viewNote = (view: VrView): string | undefined =>
  view.type === VrViewType.PAINT
    ? view.round.note
    : view.type === VrViewType.REVEAL
      ? view.reveal.note
      : view.summary.note

export const viewActions = (view: VrView | undefined): VrAction[] =>
  view?.type === VrViewType.REVEAL ? view.reveal.actions : view && "summary" in view ? view.summary.actions : []

/** An action asking for confirmation says so once pressed. */
export const actionLabel = (action: VrAction, armed: VrAction | undefined): string =>
  armed?.label === action.label && action.confirm ? action.confirm : action.label

export const panelContent = (view: VrView, state: PanelState): PanelContent => {
  const round = view.type === VrViewType.PAINT ? view.round : undefined
  const reveal = view.type === VrViewType.REVEAL ? view.reveal : undefined
  const more = view.more ?? []
  const note = viewNote(view)
  return {
    ...roundElements(round),
    ...resultElements(view),
    note: { shown: note !== undefined, text: note },
    ...buttonRow("act", viewActions(view), 2, state.armed),
    more: { shown: more.length > 0 },
    ...buttonRow("more", more, MORE, state.armed),
    ...toggleElements(state, reveal),
    heading: { text: viewHeading(view) }
  }
}

const roundElements = (round: VrRound | undefined): PanelContent => {
  const painting = round?.playing === true && round.unlock === undefined
  return {
    hint: {
      shown: painting,
      text: round?.paint.fillable.value
        ? "Turn your left palm up for paint tools and hints. A or X brings out the fill pail: a pull fills the country it points at."
        : "Turn your left palm up for paint tools and hints."
    },
    mode: { shown: round?.mode !== undefined, text: round?.mode || undefined },
    done: { shown: painting },
    unlock: { shown: round?.unlock !== undefined },
    clock: { shown: round?.timeLeft !== undefined }
  }
}

const resultElements = (view: VrView): PanelContent => {
  switch (view.type) {
    case VrViewType.PAINT:
      return { prompt: { text: view.round.prompt }, score: { shown: false }, fact: { shown: false } }
    case VrViewType.REVEAL:
      return {
        prompt: { text: view.reveal.label },
        score: { shown: true, text: view.reveal.scoreLine },
        fact: { shown: view.reveal.fact !== undefined, text: view.reveal.fact }
      }
    case VrViewType.DONE:
    case VrViewType.LOBBY:
      return {
        prompt: { text: view.summary.title },
        score: { shown: true, text: view.summary.scoreLine },
        fact: { shown: false }
      }
  }
}

const buttonRow = (prefix: string, actions: VrAction[], count: number, armed: VrAction | undefined): PanelContent => {
  const row: PanelContent = {}
  for (let i = 0; i < count; i++) {
    const action = actions[i]
    if (!action) {
      row[`${prefix}${i}`] = { shown: false }
      continue
    }
    row[`${prefix}${i}`] = { shown: true, disabled: action.enabled === false }
    row[`${prefix}${i}Label`] = { text: actionLabel(action, armed) }
  }
  return row
}

const toggleElements = (state: PanelState, reveal: VrReveal | undefined): PanelContent => ({
  soundLabel: { text: state.soundOn ? "Sound on" : "Sound off" },
  passthrough: { shown: state.passthroughOffered },
  passthroughLabel: { text: state.passthroughOn ? "Show space" : "See your room" },
  extras: { shown: reveal?.flags !== undefined },
  ...(reveal?.flags && { flagsLabel: { text: reveal.flags.on ? "Hide all flags" : "Show all flags" } })
})
