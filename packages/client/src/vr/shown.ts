/** What each part of the headset shows of a view. */
import type { MapDetail } from "@whereabouts/shared/protocol/config"
import { RevealDetail, type ShownDetail } from "../map/shown-detail"
import type { VrBoard } from "./scores/board"
import type { VrFlagPin } from "./globe/flag-pins"
import type { VrTable } from "./scores/scores"
import { VrPaintsType, VrViewType, type VrView } from "./view/view"

/** What the map patch over the globe draws: the reveal's state lines, or the round's detail. */
export function patchDetail(view: VrView): MapDetail | { stateRound: boolean } | undefined {
  if (!("round" in view)) return undefined
  return view.type === VrViewType.REVEAL ? { stateRound: view.reveal.stateRound } : view.round.detail
}

/** As the page's map: everything on the reveal, while painting what the round's detail shows. */
export function globeDetail(view: VrView): ShownDetail | undefined {
  if (view.type === VrViewType.REVEAL) return RevealDetail.REVEAL
  return view.type === VrViewType.PAINT ? view.round.detail : undefined
}

export function tableOf(view: VrView): VrTable | undefined {
  if (view.type === VrViewType.REVEAL) return view.reveal.table
  return "summary" in view ? view.summary.table : view.round.table
}

export function boardOf(view: VrView): VrBoard | undefined {
  return "summary" in view ? view.summary.board : undefined
}

/** Pins only while flags are on. */
export function flagPinsOf(view: VrView): VrFlagPin[] | undefined {
  const flags = view.type === VrViewType.REVEAL ? view.reveal.flags : undefined
  return flags?.on ? flags.pins : undefined
}

/** Players' colours tell them apart, so they tell whose paint is shown. */
export function paintsKey(view: VrView): string {
  if (view.type !== VrViewType.REVEAL) return ""
  const { paints } = view.reveal
  return paints.type === VrPaintsType.PLAYERS ? paints.paints.map((paint) => paint.colour).join() : "own"
}
