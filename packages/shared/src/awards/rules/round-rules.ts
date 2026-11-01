import { FactsType } from "../player-facts.ts"
import { booby, prize, roughDistance, top, type Rule } from "./rule-kit.ts"

const bullseye: Rule = ({ rounds }) => {
  const best = top(rounds, ({ round }) => (round.score >= 950 ? round.score : undefined))
  return (
    best &&
    prize(
      "🎯",
      "Bullseye",
      best.item.player.playerId,
      `{0} put ${best.item.round.label} dead centre. Nobody likes a show-off.`
    )
  )
}

const offByAMile: Rule = ({ rounds }) => {
  const far = top(rounds, ({ round }) =>
    round.type === FactsType.POINT && round.point.miss >= 1500 && round.point.missCost >= 400
      ? round.point.miss
      : undefined
  )
  return (
    far &&
    booby(
      "🛰️",
      "Off by a Mile",
      far.item.player.playerId,
      `{0} put ${far.item.round.label} ${roughDistance(far.value)} away. Visible from space, to be fair.`
    )
  )
}

const confidentlyWrong: Rule = ({ rounds }) => {
  const sure = top(rounds, ({ round }) =>
    round.type === FactsType.POINT && round.point.spread < 100 && round.point.missCost >= 600
      ? round.point.missCost
      : undefined
  )
  return (
    sure &&
    booby(
      "🫡",
      "Confidently Wrong",
      sure.item.player.playerId,
      `{0} was absolutely certain about ${sure.item.round.label}. Absolutely.`
    )
  )
}

const wrongHouse: Rule = ({ rounds }) => {
  const door = rounds.find(({ round }) => round.type === FactsType.AREA && round.region.nextDoor)
  return (
    door &&
    booby(
      "🏡",
      "Wrong House",
      door.player.playerId,
      `{0} painted next door to ${door.round.label}. The neighbours have been informed.`
    )
  )
}

const borderControl: Rule = ({ rounds }) => {
  const spill = top(rounds, ({ round }) =>
    round.type === FactsType.AREA && round.region.precision >= 0.1 && round.region.precision <= 0.5
      ? 1 - round.region.precision
      : undefined
  )
  return (
    spill && booby("🚧", "Border Control", spill.item.player.playerId, `{0} treats borders as more of a suggestion.`)
  )
}

export const ROUND_RULES: Rule[] = [bullseye, offByAMile, confidentlyWrong, wrongHouse, borderControl]
