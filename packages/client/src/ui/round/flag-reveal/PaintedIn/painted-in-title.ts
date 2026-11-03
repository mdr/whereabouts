import type { PaintedCountry } from "@whereabouts/shared/borders"

export const paintedPercent = (where: PaintedCountry): number => Math.round(where.share * 100)

/** `whose` names the painter: "your", "Ann's". */
export const paintedInTitle = (where: PaintedCountry, answer: string | undefined, whose: string): string =>
  `${paintedPercent(where)}% of ${whose} paint was in ${where.country.label}${where.country.clue.flag === answer ? ", the answer" : ""}`
