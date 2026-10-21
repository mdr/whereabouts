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
                <span class="name">
                  <span class="name-text">{p?.name ?? "?"}</span>
                  {p?.isHost && <HostTag />}
                </span>
                <span class="total" title="Total">
                  {Math.round(s.total).toLocaleString()}
                </span>
              </li>
            )
          })}
        </ol>
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.again()} data-testid={resultsTestIds.playAgainButton}>
            <Icon name="refresh" /> Play again
          </button>
        ) : (
          <p class="hint">
            <HostWord capital /> can start another game with the same group.
          </p>
        )}
        <ScoreTable rounds={view.playedRounds ?? []} standings={standings} byId={byId} you={view.you.id} />
        {view.awards && view.awards.length > 0 && <Awards awards={view.awards} byId={byId} />}
        <p class="hint">
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  )
}

/**
 * Every round's score for every player: a row per round, saying what it
 * asked, and a column per player in finishing order, each round's best
 * picked out. Many players scroll sideways, the rounds staying in view.
 */
function ScoreTable({
  rounds,
  standings,
  byId,
  you
}: {
  rounds: PlayedRound[]
  standings: FinalStanding[]
  byId: Map<string, PlayerView>
  you: string | undefined
}) {
  if (rounds.length === 0) return undefined
  const best = rounds.map((_, r) => Math.max(-1, ...standings.map((s) => s.rounds[r]?.score ?? -1)))
  return (
    <section class="score-table" aria-label="Scores by round">
      <h2>Rounds</h2>
      <div class="score-table-scroll">
        <table>
          <thead>
            <tr>
              <th class="round-cell" scope="col">
                <span class="sr-only">Round</span>
              </th>
              {standings.map((s) => {
                const p = byId.get(s.playerId)
                return (
                  <th key={s.playerId} scope="col" class={s.playerId === you ? "you" : ""} title={p?.name}>
                    <i class="swatch" style={{ background: colourCss(p?.colour) }} />
                    <span class="player-name">{p?.name ?? "?"}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rounds.map((round, r) => (
              <tr key={r} data-testid={resultsTestIds.playedRound}>
                <th class="round-cell" scope="row">
                  <span class="round-what">
                    <span class="round-number">{r + 1}</span>
                    <RoundPicture round={round} />
                    <span class="round-label">{round.label}</span>
                  </span>
                </th>
                {standings.map((s) => {
                  const score = s.rounds[r]?.score
                  const won = score !== undefined && score === best[r]
                  return (
                    <td
                      key={s.playerId}
                      class={`${won ? "best" : ""} ${s.playerId === you ? "you" : ""}`}
                      title={score === undefined ? "Sat out" : won ? "Won the round" : undefined}
                    >
                      {score === undefined ? "–" : Math.round(score)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RoundPicture({ round }: { round: PlayedRound }) {
  if (round.image)
    return <img class="round-photo" src={commonsImageUrl(round.image, 120)} alt="" referrerpolicy="no-referrer" />
  if (round.flag) return <SmallFlag code={round.flag} />
  return (
    <span class="round-pin">
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
