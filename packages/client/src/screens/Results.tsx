import { colourCss } from "@whereabouts/shared/colours"
import type { Award } from "@whereabouts/shared/awards"
import type { FinalStanding, GameView, PlayedRound, PlayerView, QuestionType } from "@whereabouts/shared/protocol"
import type { RegionId } from "@whereabouts/shared/ids"
import { useEffect, useMemo, useState } from "preact/hooks"
import type { Connection } from "../net"
import { Icon } from "../ui/icons"
import { HostTag, HostWord, Swatch } from "../ui/PlayerList"
import { Banner } from "../ui/Banner"
import { SmallFlag, SmallFlagButton, SmallPhoto, SmallPictureBox } from "../ui/Pictures"
import { typeColour } from "../ui/MixEditor"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import s from "./Results.module.css"
import { outlinePath } from "../ui/outline-path"
import { useRegion } from "../regions"
import { useElementRef } from "../ui/element-ref"
import { VrButton, useVrView } from "../ui/VrButton"
import { navigate } from "../router"
import type { VrView } from "../vr/view"
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
    <div class={kit.page}>
      <div class={cx(kit.pageCard, s.card)} data-testid={resultsTestIds.page}>
        <Banner />
        {winner && (
          <p class={kit.tagline} data-testid={resultsTestIds.winner}>
            <Swatch colour={winner.colour} /> <b>{winner.name}</b>
            {winner.isHost && <HostTag />} wins
          </p>
        )}
        <ol class={cx(s.standings, standings.length > MANY_PLAYERS && s.many)} aria-label="Final standings">
          {standings.map((st, i) => {
            const p = byId.get(st.playerId)
            return (
              <li
                key={st.playerId}
                class={cx(s.row, st.playerId === view.you.id && s.you, i >= MEDALS.length && s.minor)}
                data-testid={resultsTestIds.standingsRow}
                data-player={p?.name}
              >
                <span class={s.place} data-testid={resultsTestIds.place}>
                  {MEDALS[i] ?? i + 1}
                </span>
                <span class={s.dot}>
                  <Swatch as="i" colour={p?.colour} />
                </span>
                <span class={s.name}>
                  <span class={s.nameText}>{p?.name ?? "?"}</span>
                  {p?.isHost && <HostTag />}
                </span>
                <span class={s.total} title="Total" data-testid={resultsTestIds.total}>
                  {Math.round(st.total).toLocaleString()}
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
          <p class={kit.hint}>
            <HostWord capital /> can start another game with the same group.
          </p>
        )}
        {view.awards && view.awards.length > 0 && <Awards awards={view.awards} byId={byId} />}
        <Rounds rounds={view.playedRounds ?? []} standings={standings} byId={byId} you={view.you.id} />
        <p class={kit.hint}>
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
    <section class={s.rounds} aria-label="Scores by round" ref={ref}>
      <h2>Rounds</h2>
      {fits || everyone ? <ScoreTable {...props} best={best} scrolls={!fits} /> : <RoundList {...props} best={best} />}
      {!fits && (
        <button
          type="button"
          class={cx("small", s.everyoneToggle)}
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
    <ol class={s.list}>
      <li class={s.head} aria-hidden="true">
        <span class={s.text} />
        <span>Best</span>
        {mine && <span class={s.yours}>You</span>}
      </li>
      {rounds.map((round, r) => {
        const winners = standings.filter((s) => s.rounds[r]?.score === best[r]).map((s) => byId.get(s.playerId))
        const first = winners[0]
        const yours = mine?.rounds[r]?.score
        return (
          <li key={r} data-testid={resultsTestIds.playedRound}>
            <span class={s.number}>{r + 1}</span>
            <RoundWhat round={round} />
            {first && (
              <span
                class={s.winner}
                data-testid={resultsTestIds.roundWinner}
                title={`Won by ${winners.map((p) => p?.name ?? "?").join(", ")}`}
              >
                <Swatch as="i" colour={first.colour} />
                <span class={s.winnerName}>{first.name}</span>
                {winners.length > 1 && <span class={s.tied}>+{winners.length - 1}</span>}
                <b>{Math.round(best[r]!)}</b>
              </span>
            )}
            {mine && (
              <span
                class={cx(s.yours, yours !== undefined && yours === best[r] && s.best)}
                title="Your score"
                data-testid={resultsTestIds.roundYours}
              >
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
    <div class={cx(s.scroll, scrolls && s.scrolls)}>
      <table class={s.table} data-testid={resultsTestIds.table}>
        <thead>
          <tr>
            <th class={s.roundCell} scope="col">
              <span class="sr-only">Round</span>
            </th>
            {standings.map((st) => {
              const p = byId.get(st.playerId)
              return (
                <th key={st.playerId} scope="col" class={st.playerId === you ? s.you : undefined} title={p?.name}>
                  <Swatch as="i" colour={p?.colour} class={s.headSwatch} />
                  <span class={s.playerName} data-testid={resultsTestIds.playerName}>
                    {p?.name ?? "?"}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, r) => (
            <tr key={r} data-testid={resultsTestIds.playedRound}>
              <th class={s.roundCell} scope="row">
                <span class={s.what}>
                  <span class={s.number}>{r + 1}</span>
                  <RoundWhat round={round} />
                </span>
              </th>
              {standings.map((st) => {
                const score = st.rounds[r]?.score
                const won = score !== undefined && score === best[r]
                return (
                  <td
                    key={st.playerId}
                    class={cx(won && s.best, st.playerId === you && s.you)}
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

/** The lobby's colour for each kind (global.css, --type-*), for the headset's board. */
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
      <span class={s.text}>
        <span class={s.label} data-testid={resultsTestIds.roundLabel}>
          {round.label}
          {round.regionId && round.flag && <SmallFlag code={round.flag} class={s.labelFlag} />}
        </span>
        <span class={s.type} style={typeColour(round.type)} data-testid={resultsTestIds.roundType}>
          {typeName(round)}
        </span>
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
    <SmallPictureBox>
      <Icon name="pin" size={18} />
    </SmallPictureBox>
  )
}

function RoundShape({ id, type }: { id: RegionId; type: QuestionType }) {
  const region = useRegion(id)
  const d = useMemo(() => (region ? outlinePath(region.outline, region.answer, 56, 42) : ""), [region])
  return (
    <SmallPictureBox class={s.shape} style={typeColour(type)}>
      {d && (
        <svg viewBox="0 0 56 42" aria-hidden="true">
          <path d={d} />
        </svg>
      )}
    </SmallPictureBox>
  )
}

function Awards({ awards, byId }: { awards: Award[]; byId: Map<string, PlayerView> }) {
  return (
    <section class={s.awards} aria-label="Awards">
      <h2>Awards</h2>
      <ul>
        {awards.map((a) => (
          <li key={a.title} class={s.award} data-testid={resultsTestIds.award}>
            <span class={s.emoji} aria-hidden="true">
              {a.emoji}
            </span>
            <span class={s.body}>
              <b class={s.title}>{a.title}</b>
              <span class={s.line}>
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
          <b key={i} style={{ color: p ? colourCss(p.colour) : undefined }}>
            {p?.name ?? "Someone"}
          </b>
        )
      })}
    </>
  )
}
