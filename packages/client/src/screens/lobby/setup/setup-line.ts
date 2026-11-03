import { MAP_DETAILS, mixTotal } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { describeMix } from "../../../ui/setup/describe-mix"

/** The setup in a line, for a guest in the headset. */
export const setupLine = (view: GameView): string => {
  const { roundLength, mix, mapDetail, hints } = view.config
  const rounds = mixTotal(mix)
  const map = MAP_DETAILS.find((detail) => detail.id === mapDetail)?.label ?? mapDetail
  return `${rounds} ${rounds === 1 ? "round" : "rounds"} ${roundLength === undefined ? "with no time limit" : `of ${roundLength / 1000} s`}, ${hints === undefined ? "unlimited hints" : `${hints} ${hints === 1 ? "hint" : "hints"} each`}: ${describeMix(mix)}. ${map} map.`
}
