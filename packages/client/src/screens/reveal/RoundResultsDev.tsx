import type { PlayerId } from "@whereabouts/shared/ids"
import { AnswerType } from "@whereabouts/shared/questions"
import { RoundGuessType, type RevealView } from "@whereabouts/shared/protocol/views"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import type { AnswerParts } from "@whereabouts/shared/scoring/regions"
import { Card } from "../../ui/Card/Card"
import kit from "../../ui/kit.module.css"
import { HostTag } from "../../ui/players/HostTag/HostTag"
import { ScoreParts } from "../../ui/round/ScoreParts"

/** Developer-only: how each player's score was made up. */
export const RoundResultsDev = ({
  results,
  byId
}: {
  results: RevealView["results"]
  byId: ReadonlyMap<PlayerId, PlayingPlayerView>
}) => (
  <Card title="Round results">
    <ul class={kit.results}>
      {results.map((result) => (
        <li key={result.playerId}>
          <span>
            {byId.get(result.playerId)?.name ?? "?"}
            {byId.get(result.playerId)?.isHost && <HostTag />}
          </span>
          {result.guess.type === RoundGuessType.PAINTED && <PartsLine parts={result.guess.parts} />}
        </li>
      ))}
    </ul>
  </Card>
)

const PartsLine = ({ parts }: { parts: AnswerParts }) => {
  if (parts.type === AnswerType.POINT) return <ScoreParts A={parts.A} B={parts.B} />
  return (
    <span class={kit.parts}>
      shape <b>{Math.round(parts.shape)}</b> · nearness <b>{Math.round(parts.nearness)}</b>
    </span>
  )
}
