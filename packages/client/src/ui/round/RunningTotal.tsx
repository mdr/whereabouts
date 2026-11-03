import type { GameView } from "@whereabouts/shared/protocol/views"
import { totalOf } from "../../round/round-model"
import { formatPoints } from "../format"
import { HeaderNote } from "../map/Hud/Hud"

/** Practice's header note: your score so far. */
export const RunningTotal = ({ view }: { view: GameView }) => (
  <HeaderNote nowrap>{formatPoints(totalOf(view))}</HeaderNote>
)
