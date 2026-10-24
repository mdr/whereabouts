import {
  colourCss,
  commonsImageUrl,
  type Award,
  type FinalStanding,
  type GameView,
  type PlayedRound,
  type PlayerView
} from "@whereabouts/shared"
import { useEffect, useState } from "preact/hooks"
import type { Connection } from "../net"
import { Icon } from "../ui/icons"
import { HostTag, HostWord } from "../ui/PlayerList"
import { Banner } from "../ui/Banner"
import { SmallFlag } from "../ui/bits"
import { useElementRef } from "../ui/element-ref"
import { useVrView } from "../ui/VrButton"
import { resultsTestIds } from "./ResultsTestIds"

const MEDALS = ["🥇", "🥈", "🥉"]
/** Past this many players the standings tighten up, the podium aside. */
const MANY_PLAYERS = 8
/** The room the full table needs: the round column, then one column per player. */
const ROUND_COLUMN_PX = 200
const SCORE_COLUMN_PX = 58

export function Results({ conn, view }: { conn: Connection; view: GameView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]))
  const standings = view.results ?? []
  const winner = standings[0] ? byId.get(standings[0].playerId) : undefined
  useVrView(
    {
      kind: "done",
      summary: {
        title: "Final standings",
        scoreLine: winner ? `${winner.name} wins` : "",
        table: {
          title: "Standings",
          rows: standings.map((s, i) => {
            const p = byId.get(s.playerId)
            return {
              colour: p && colourCss(p.colour),
              name: `${i + 1}. ${p?.name ?? "?"}${s.playerId === view.you.id ? " (you)" : ""}`,
              total: Math.round(s.total).toLocaleString()
            }
          })
        },
        note: view.you.isHost ? undefined : "The host can start another game with the same group.",
        actions: view.you.isHost ? [{ label: "Play again", press: () => conn.again() }] : []
      }
    },
    "results"
  )
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
        <ol class={`standings ${standings.length > MANY_PLAYERS ? "many" : ""}`} aria-label="Final standings">
          {standings.map((s, i) => {
            const p = byId.get(s.playerId)
            return (
              <li
                key={s.playerId}
                class={`standings-row ${s.playerId === view.you.id ? "you" : ""} ${i >= MEDALS.length ? "minor" : ""}`}
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
        {view.awards && view.awards.length > 0 && <Awards awards={view.awards} byId={byId} />}
        <Rounds rounds={view.playedRounds ?? []} standings={standings} byId={byId} you={view.you.id} />
        <p class="hint">
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  )
}

interface RoundsProps {
  rounds: PlayedRound[]
  standings: FinalStanding[]
  byId: Map<string, PlayerView>
  you: string | undefined
}

/**
 * What each round asked and how it went: the full table of everyone's
 * scores where it fits, else a line per round with its winner and your
 * score, and a button for the full table.
 */
function Rounds(props: RoundsProps) {
  const { rounds, standings } = props
  const ref = useElementRef<HTMLElement>()
  const [width, setWidth] = useState<number | undefined>(undefined)
  const [everyone, setEveryone] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (rounds.length === 0) return undefined
  const fits =
    width === undefined ? standings.length <= 6 : width >= ROUND_COLUMN_PX + standings.length * SCORE_COLUMN_PX
  const best = rounds.map((_, r) => Math.max(-1, ...standings.map((s) => s.rounds[r]?.score ?? -1)))
  return (
    <section class="score-table" aria-label="Scores by round" ref={ref}>
      <h2>Rounds</h2>
      {fits || everyone ? <ScoreTable {...props} best={best} scrolls={!fits} /> : <RoundList {...props} best={best} />}
      {!fits && (
        <button
          type="button"
          class="small everyone-toggle"
          onClick={() => setEveryone(!everyone)}
          data-testid={resultsTestIds.everyoneToggle}
        >
          {everyone ? "Just the winners" : `Everyone's scores (${standings.length})`}
        </button>
      )}
    </section>
  )
}

/** A line per round: what it asked, who won it (and how many tied), and your score. */
function RoundList({ rounds, standings, byId, you, best }: RoundsProps & { best: number[] }) {
  const mine = standings.find((s) => s.playerId === you)
  return (
    <ol class="round-list">
      <li class="round-list-head" aria-hidden="true">
        <span class="round-label" />
        <span>Best</span>
        {mine && <span class="round-yours">You</span>}
      </li>
      {rounds.map((round, r) => {
        const winners = standings.filter((s) => s.rounds[r]?.score === best[r]).map((s) => byId.get(s.playerId))
        const first = winners[0]
        const yours = mine?.rounds[r]?.score
        return (
          <li key={r} data-testid={resultsTestIds.playedRound}>
            <span class="round-number">{r + 1}</span>
            <RoundPicture round={round} />
            <span class="round-label">{round.label}</span>
            {first && (
              <span class="round-winner" title={`Won by ${winners.map((p) => p?.name ?? "?").join(", ")}`}>
                <i class="swatch" style={{ background: colourCss(first.colour) }} />
                <span class="winner-name">{first.name}</span>
                {winners.length > 1 && <span class="tied">+{winners.length - 1}</span>}
                <b>{Math.round(best[r]!)}</b>
              </span>
            )}
            {mine && (
              <span class={`round-yours ${yours !== undefined && yours === best[r] ? "best" : ""}`} title="Your score">
                {yours === undefined ? "–" : Math.round(yours)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
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
  you,
  best,
  scrolls
}: RoundsProps & { best: number[]; scrolls: boolean }) {
  return (
    <div class={`score-table-scroll ${scrolls ? "scrolls" : ""}`}>
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
