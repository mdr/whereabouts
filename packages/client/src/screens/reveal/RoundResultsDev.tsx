import type { PlayerId } from "@whereabouts/shared/ids"
import { AnswerType } from "@whereabouts/shared/questions"
import { RoundGuessType, type RevealView } from "@whereabouts/shared/protocol"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import type { AnswerParts } from "@whereabouts/shared/scoring/regions"
import { Card } from "../../ui/Card/Card"
import kit from "../../ui/kit.module.css"
import { HostTag } from "../../ui/players/HostTag/HostTag"
import { ScoreParts } from "../../ui/round/ScoreParts"

/** Developer-only: how each player's score was made up. */
export function RoundResultsDev({
  results,
  byId
}: {
  results: RevealView["results"]
  byId: ReadonlyMap<PlayerId, PlayingPlayerView>
}) {
  return (
    <Card title="Round results">
      <ul class={kit.results}>
        {results.map((r) => (
          <li key={r.playerId}>
            <span>
              {byId.get(r.playerId)?.name ?? "?"}
              {byId.get(r.playerId)?.isHost && <HostTag />}
            </span>
            {r.guess.type === RoundGuessType.PAINTED && <PartsLine parts={r.guess.parts} />}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function PartsLine({ parts }: { parts: AnswerParts }) {
  if (parts.type === AnswerType.POINT) return <ScoreParts A={parts.A} B={parts.B} />
  return (
    <span class={kit.parts}>
      shape <b>{Math.round(parts.shape)}</b> · nearness <b>{Math.round(parts.nearness)}</b>
    </span>
  )
}
