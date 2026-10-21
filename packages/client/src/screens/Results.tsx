import {
  colourCss,
  commonsImageUrl,
  type Award,
  type FinalStanding,
  type GameView,
  type PlayedRound,
  type PlayerView
} from "@whereabouts/shared"
import type { Connection } from "../net"
import { Icon } from "../ui/icons"
import { HostTag, HostWord } from "../ui/PlayerList"
import { Banner } from "../ui/Banner"
import { SmallFlag } from "../ui/bits"
import { resultsTestIds } from "./ResultsTestIds"

const MEDALS = ["🥇", "🥈", "🥉"]

export function Results({ conn, view }: { conn: Connection; view: GameView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]))
  const standings = view.results ?? []
  const winner = standings[0] ? byId.get(standings[0].playerId) : undefined
  // The top score in each round, so each round's winner is picked out.
  const roundCount = Math.max(0, ...standings.map((s) => s.rounds.length))
  const roundBest = Array.from({ length: roundCount }, (_, r) =>
    Math.max(-1, ...standings.map((s) => s.rounds[r]?.score ?? -1))
  )
  const played = view.playedRounds ?? []
  return (
    <div class="home">
      <div class="home-card results-card" data-testid={resultsTestIds.page}>
        <Banner />
        {winner && (
          <p class="tagline">
            <span class="swatch" style={{ background: colourCss(winner.colour) }} /> <b>{winner.name}</b>
            {winner.isHost && <HostTag />} wins
          </p>
        )}
        {/* Total first and largest; the round scores sit underneath as a small strip, each round's winner in bold. */}
        <ol class="standings" aria-label="Final standings">
          {standings.map((s, i) => {
            const p = byId.get(s.playerId)
            return (
              <li
                key={s.playerId}
                class={`standings-row ${s.playerId === view.you.id ? "you" : ""}`}
                data-testid={resultsTestIds.standingsRow}
                data-player={p?.name}
              >
                <span class="place">{MEDALS[i] ?? i + 1}</span>
                <span class="dot">
                  <i class="swatch" style={{ background: colourCss(p?.colour) }} />
                </span>
                <span class="standing-body">
                  <span class="standing-main">
                    <span class="name">
                      <span class="name-text">{p?.name ?? "?"}</span>
                      {p?.isHost && <HostTag />}
                    </span>
                    <span class="total" title="Total">
                      {Math.round(s.total).toLocaleString()}
                    </span>
                  </span>
                  <span class="rounds" aria-label="Score by round">
                    {s.rounds.map(({ score }, r) => (
                      <span
                        key={r}
                        class={`round ${score !== undefined && score === roundBest[r] ? "best" : ""}`}
                        title={`Round ${r + 1}${played[r] ? `, ${played[r].label}` : ""}${score === undefined ? ": sat out" : score === roundBest[r] ? ": won the round" : ""}`}
                      >
                        {score === undefined ? "–" : Math.round(score)}
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
        {played.length > 0 && <PlayedRounds rounds={played} standings={standings} best={roundBest} byId={byId} />}
        {view.awards && view.awards.length > 0 && <Awards awards={view.awards} byId={byId} />}
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.again()} data-testid={resultsTestIds.playAgainButton}>
            <Icon name="refresh" /> Play again
          </button>
        ) : (
          <p class="hint">
            <HostWord capital /> can start another game with the same group.
          </p>
        )}
        <p class="hint">
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  )
}

/** What each round asked about, and who won it. */
function PlayedRounds({
  rounds,
  standings,
  best,
  byId
}: {
  rounds: PlayedRound[]
  standings: FinalStanding[]
  best: number[]
  byId: Map<string, PlayerView>
}) {
  return (
    <section class="played-rounds" aria-label="Rounds">
      <h2>Rounds</h2>
      <ol>
        {rounds.map((round, r) => {
          const winners = standings.filter((s) => s.rounds[r]?.score === best[r]).map((s) => byId.get(s.playerId))
          return (
            <li key={r} class="played-round" data-testid={resultsTestIds.playedRound}>
              <span class="played-number">{r + 1}</span>
              <RoundPicture round={round} />
              <span class="played-label">{round.label}</span>
              {winners.length > 0 && (
                <span class="played-best" title={`Won by ${winners.map((p) => p?.name ?? "?").join(" and ")}`}>
                  {winners.map((p, i) => (
                    <i key={i} class="swatch" style={{ background: colourCss(p?.colour) }} />
                  ))}
                  {Math.round(best[r]!)}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function RoundPicture({ round }: { round: PlayedRound }) {
  if (round.image)
    return <img class="played-photo" src={commonsImageUrl(round.image, 120)} alt="" referrerpolicy="no-referrer" />
  if (round.flag) return <SmallFlag code={round.flag} />
  return (
    <span class="played-pin">
      <Icon name="pin" size={14} />
    </span>
  )
}

function Awards({ awards, byId }: { awards: Award[]; byId: Map<string, PlayerView> }) {
  return (
    <section class="awards" aria-label="Awards">
      <h2>Awards</h2>
      <ul>
        {awards.map((a) => (
          <li key={a.title} class="award" data-testid={resultsTestIds.award}>
            <span class="award-emoji" aria-hidden="true">
              {a.emoji}
            </span>
            <span class="award-body">
              <b class="award-title">{a.title}</b>
              <span class="award-line">
                <AwardLine line={a.line} players={a.playerIds.map((id) => byId.get(id))} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The line with each {n} replaced by that player's name, in their colour. */
function AwardLine({ line, players }: { line: string; players: (PlayerView | undefined)[] }) {
  return (
    <>
      {line.split(/(\{\d\})/).map((part, i) => {
        const m = /^\{(\d)\}$/.exec(part)
        if (!m) return part
        const p = players[Number(m[1])]
        return (
          <b key={i} class="award-name" style={{ color: p ? colourCss(p.colour) : undefined }}>
            {p?.name ?? "Someone"}
          </b>
        )
      })}
    </>
  )
}
