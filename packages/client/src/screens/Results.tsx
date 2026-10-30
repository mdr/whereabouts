import { colourCss } from "@whereabouts/shared/colours"
import type { Award } from "@whereabouts/shared/awards"
import type { FinalStanding, GameView, PlayedRound, PlayerView, QuestionType } from "@whereabouts/shared/protocol"
import type { RegionId } from "@whereabouts/shared/ids"
import { useEffect, useMemo, useState } from "preact/hooks"
import type { Connection } from "../net"
import { Icon } from "../ui/icons"
import { HostTag, HostWord } from "../ui/PlayerList"
import { Banner } from "../ui/Banner"
import { SmallFlag, SmallFlagButton, SmallPhoto } from "../ui/bits"
import { outlinePath } from "../ui/outline-path"
import { useRegion } from "../regions"
import { useElementRef } from "../ui/element-ref"
import { VrButton, useVrView } from "../ui/VrButton"
import { navigate } from "../router"
import type { VrView } from "../vr"
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
  const vrView: VrView = {
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
      actions: view.you.isHost ? [{ label: "Play again", press: () => conn.again() }] : [],
      board: {
        awards: (view.awards ?? []).map((a) => ({
          emoji: a.emoji,
          title: a.title,
          line: awardParts(
            a.line,
            a.playerIds.map((id) => byId.get(id))
          )
        })),
        players: standings.map((s) => {
          const p = byId.get(s.playerId)
          return { name: p?.name ?? "?", colour: colourCss(p?.colour) }
        }),
        rounds: (view.playedRounds ?? []).map((round, r) => ({
          label: round.label,
          type: typeName(round),
          colour: TYPE_COLOURS[round.type],
          scores: standings.map((s) => s.rounds[r]?.score)
        }))
      }
    },
    more: [{ label: "Leave", press: () => navigate("/") }]
  }
  useVrView(vrView, "results")
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
        <VrButton view={vrView} />
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
        <span class="round-text" />
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
            <RoundWhat round={round} />
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
                  <RoundWhat round={round} />
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

const TYPE_NAMES: Record<QuestionType, string> = {
  landmarks: "Landmark",
  places: "Place name",
  countries: "Whole country",
  flags: "Flag",
  features: "Island, lake or sea",
  states: "US state"
}

/** The lobby's colour for each kind (style.css, .type-*), for the headset's board. */
const TYPE_COLOURS: Record<QuestionType, string> = {
  landmarks: "#ffb74d",
  places: "#4fc3f7",
  countries: "#81c784",
  flags: "#f06292",
  features: "#9575cd",
  states: "#fff176"
}

/** An island, lake or sea round says which. */
function typeName(round: PlayedRound): string {
  const topic = round.type === "features" && round.topic
  return topic ? topic[0]!.toUpperCase() + topic.slice(1) : TYPE_NAMES[round.type]
}

/** The round's picture, what it asked about, and which kind of question it was. */
function RoundWhat({ round }: { round: PlayedRound }) {
  return (
    <>
      <RoundPicture round={round} />
      <span class="round-text">
        <span class="round-label">
          {round.label}
          {round.regionId && round.flag && <SmallFlag code={round.flag} />}
        </span>
        <span class={`round-type type-${round.type}`}>{typeName(round)}</span>
      </span>
    </>
  )
}

/** A shape round shows the shape painted; the rest, the question's photo or flag, else the reveal's photo. */
function RoundPicture({ round }: { round: PlayedRound }) {
  if (round.regionId) return <RoundShape id={round.regionId} type={round.type} />
  if (round.image) return <SmallPhoto image={round.image} />
  if (round.flag) return <SmallFlagButton code={round.flag} />
  if (round.revealPhoto) return <SmallPhoto image={round.revealPhoto} />
  return (
    <span class="small-picture">
      <Icon name="pin" size={18} />
    </span>
  )
}

function RoundShape({ id, type }: { id: RegionId; type: QuestionType }) {
  const region = useRegion(id)
  const d = useMemo(() => (region ? outlinePath(region.outline, region.answer, 56, 42) : ""), [region])
  return (
    <span class={`small-picture round-shape type-${type}`}>
      {d && (
        <svg viewBox="0 0 56 42" aria-hidden="true">
          <path d={d} />
        </svg>
      )}
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

/** An award's line in pieces, each player's name in their colour. */
function awardParts(line: string, players: (PlayerView | undefined)[]): { text: string; colour?: string }[] {
  return line
    .split(/(\{\d\})/)
    .filter((part) => part !== "")
    .map((part) => {
      const m = /^\{(\d)\}$/.exec(part)
      if (!m) return { text: part }
      const p = players[Number(m[1])]
      return { text: p?.name ?? "Someone", colour: p ? colourCss(p.colour) : undefined }
    })
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
