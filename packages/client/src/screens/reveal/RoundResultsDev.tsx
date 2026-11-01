import { AnswerType } from "@whereabouts/shared/questions"
import { RoundGuessType, type PlayerView, type RevealView } from "@whereabouts/shared/protocol"
import type { AnswerParts } from "@whereabouts/shared/scoring/regions"
import { Card } from "../../ui/Card"
import kit from "../../ui/kit.module.css"
import { HostTag } from "../../ui/players/HostTag"
import { ScoreParts } from "../../ui/round/ScoreParts"

/** Developer-only: how each player's score was made up. */
export function RoundResultsDev({ results, byId }: { results: RevealView["results"]; byId: Map<string, PlayerView> }) {
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
