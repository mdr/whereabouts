import { describe, expect, it } from "vite-plus/test"
import { FactsType, pickAwards, type AreaFacts, type PlayerFacts, type PointFacts, type RoundFacts } from "./awards.ts"
import { playerId } from "../ids.ts"
import type { Ms } from "../units.ts"

const BASE = { label: "Paris", lockedAfter: 30_000, roundLength: 60_000 }
type Extra = Partial<typeof BASE & { area: number }>
/** A round with paint that earns nothing in particular. */
const round = (score: number, extra: Extra = {}): AreaFacts => ({
  type: FactsType.AREA,
  ...BASE,
  score,
  area: 10_000,
  region: { precision: 1, nextDoor: false },
  ...extra
})
const pass = (score = 250): RoundFacts => ({ type: FactsType.PASSED, ...BASE, score })
const pointRound = (score: number, point: PointFacts["point"], extra: Extra = {}): RoundFacts => ({
  type: FactsType.POINT,
  ...BASE,
  score,
  area: 10_000,
  point,
  ...extra
})
const regionRound = (score: number, region: AreaFacts["region"]): RoundFacts => ({ ...round(score), region })
/** Player "a" is p1, "b" p2, and so on. */
const idOf = (letter: string) => playerId(`p${letter.charCodeAt(0) - 96}`)
const player = (letter: string, rounds: (RoundFacts | undefined)[]): PlayerFacts => ({ playerId: idOf(letter), rounds })
const SEEDS = Array.from({ length: 20 }, (_, i) => ((i + 1) * 2654435761) >>> 0)

describe("pickAwards", () => {
  it("hands out everything earned, when that is no more than five", () => {
    const players = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
      player(id, [i === 0 ? pass(100) : round(100 + i * 150), round(900 - i * 150), i === 0 ? pass(500) : round(500)])
    )
    for (const seed of SEEDS) {
      const awards = pickAwards(players, seed)
      // Four were earned, two each by the passer and the last-placed player: all are handed out.
      expect(awards.map((award) => `${award.title}:${award.playerIds.join()}`).sort()).toEqual([
        "Chicken:p1",
        "Comeback Kid:p1",
        "Rollercoaster:p6",
        "Wooden Spoon:p6"
      ])
    }
  })

  it("finds the chicken, the bottler and the wooden spoon", () => {
    const players = [
      player("a", [pass(), pass(), pass()]),
      player("b", [round(900), round(100), round(100)]),
      player("c", [round(400), round(900), round(950)])
    ]
    const awards = SEEDS.flatMap((seed) => pickAwards(players, seed))
    const all = new Set(awards.map((award) => award.title))
    expect(all).toContain("Chicken")
    expect(all).toContain("Bottled It")
    expect(all).toContain("Wooden Spoon")
    expect(awards.find((award) => award.title === "Chicken")!.playerIds).toEqual([idOf("a")])
    expect(awards.find((award) => award.title === "Bottled It")!.playerIds).toEqual([idOf("b")])
  })

  it("only awards what someone earned", () => {
    // Two dull, identical players: ties win nothing, and nobody did anything daft.
    const dull = [player("a", [round(500), round(500)]), player("b", [round(500), round(500)])]
    expect(pickAwards(dull, 1)).toEqual([])
  })

  it("leaves a short round's last seconds to the end of it", () => {
    const at = (lockedAfter: Ms) => round(500, { lockedAfter, roundLength: 10_000 })
    const titles = (rounds: RoundFacts[]) =>
      SEEDS.flatMap((seed) => pickAwards([player("a", rounds), player("b", [round(500), round(500)])], seed)).map(
        (award) => award.title
      )
    expect(titles([at(6_000), at(7_000)])).not.toContain("Last-Second Merchant")
    expect(titles([at(9_000), at(9_000)])).toContain("Last-Second Merchant")
  })

  it("names a confident miss, with the distance", () => {
    const miss = pointRound(
      60,
      { spot: { lat: 0, lon: 0 }, miss: 9_400, spread: 10, missCost: 930, hedged: false, tolerance: 100 },
      { label: "Tokyo" }
    )
    const awards = SEEDS.flatMap((seed) => pickAwards([player("a", [miss]), player("b", [round(700)])], seed))
    expect(awards.map((award) => award.line)).toContain("{0} put Tokyo 9,400 km away. Visible from space, to be fair.")
  })
})

/** Every award these players earned, over enough seeds that the cap hides none. */
const earned = (players: PlayerFacts[]) => SEEDS.flatMap((seed) => pickAwards(players, seed))
const titles = (players: PlayerFacts[]) => new Set(earned(players).map((award) => award.title))
const winners = (title: string, players: PlayerFacts[]) =>
  earned(players).find((award) => award.title === title)?.playerIds
const AVERAGE = [round(500), round(500)]
const point = (extra: Partial<PointFacts["point"]>): PointFacts["point"] => ({
  spot: { lat: 0, lon: 0 },
  miss: 0,
  spread: 0,
  missCost: 0,
  hedged: false,
  tolerance: 100,
  ...extra
})

describe("each award", () => {
  it("Bullseye: a round of 950 or more", () => {
    expect(winners("Bullseye", [player("a", [round(960), round(500)]), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", [round(940), round(500)]), player("b", AVERAGE)])).not.toContain("Bullseye")
  })

  it("Off by a Mile: a costly miss of 1,500 km or more", () => {
    const missed = (miss: number) => [pointRound(100, point({ miss, spread: 500, missCost: 450 })), round(500)]
    expect(winners("Off by a Mile", [player("a", missed(1600)), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", missed(1400)), player("b", AVERAGE)])).not.toContain("Off by a Mile")
  })

  it("Confidently Wrong: tight paint that missed", () => {
    const sure = (spread: number) => [pointRound(300, point({ miss: 800, spread, missCost: 650 })), round(500)]
    expect(winners("Confidently Wrong", [player("a", sure(50)), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", sure(120)), player("b", AVERAGE)])).not.toContain("Confidently Wrong")
  })

  it("Wrong House: paint all just over a country's border", () => {
    const door = (nextDoor: boolean) => [regionRound(200, { precision: 0.05, nextDoor }), round(500)]
    expect(winners("Wrong House", [player("a", door(true)), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", door(false)), player("b", AVERAGE)])).not.toContain("Wrong House")
  })

  it("Border Control: between a tenth and half the paint on the country", () => {
    const spill = (precision: number) => [regionRound(400, { precision, nextDoor: false }), round(500)]
    expect(winners("Border Control", [player("a", spill(0.3)), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", spill(0.6)), player("b", AVERAGE)])).not.toContain("Border Control")
  })

  it("Fence Sitter: places painted wide, on average", () => {
    const wide = (spread: number) => [pointRound(500, point({ spread })), pointRound(500, point({ spread }))]
    expect(winners("Fence Sitter", [player("a", wide(350)), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", wide(290)), player("b", AVERAGE)])).not.toContain("Fence Sitter")
  })

  it("Hedge Fund Manager: two or more hedged rounds", () => {
    const hedged = pointRound(500, point({ hedged: true }))
    expect(winners("Hedge Fund Manager", [player("a", [hedged, hedged]), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", [hedged, round(500)]), player("b", AVERAGE)])).not.toContain("Hedge Fund Manager")
  })

  it("Chicken: two or more passes", () => {
    const passed = pass()
    expect(winners("Chicken", [player("a", [passed, passed]), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", [passed, round(750)]), player("b", AVERAGE)])).not.toContain("Chicken")
  })

  it("Fastest Finger: the quickest to lock in, under 40% of the round on average", () => {
    const locked = (seconds: number) => Array.from({ length: 3 }, () => round(500, { lockedAfter: seconds * 1000 }))
    const fast = [player("a", locked(10)), player("b", locked(20))]
    expect(earned(fast).find((award) => award.title === "Fastest Finger")).toMatchObject({
      playerIds: [idOf("a")],
      line: "{0} locked in after 10 seconds on average. Thinking is overrated."
    })
    expect(titles([player("a", locked(25)), player("b", locked(30))])).not.toContain("Fastest Finger")
  })

  describe("Picasso: twice the paint of the others' middle player", () => {
    const painting = (area: number) => [round(500, { area }), round(500, { area })]

    it("among three", () => {
      const others = [player("b", painting(10_000)), player("c", painting(10_000))]
      expect(winners("Picasso", [player("a", painting(20_000)), ...others])).toEqual([idOf("a")])
      expect(titles([player("a", painting(19_000)), ...others])).not.toContain("Picasso")
    })

    it("between two", () => {
      expect(winners("Picasso", [player("a", painting(20_000)), player("b", painting(10_000))])).toEqual([idOf("a")])
      expect(titles([player("a", painting(19_000)), player("b", painting(10_000))])).not.toContain("Picasso")
    })

    it("never alone, or against no paint", () => {
      expect(titles([player("a", painting(20_000))])).not.toContain("Picasso")
      expect(titles([player("a", painting(20_000)), player("b", [pass(), pass()])])).not.toContain("Picasso")
    })
  })

  it("One Careful Dab: the smallest paint, over three rounds or more", () => {
    const painting = (area: number) => Array.from({ length: 3 }, () => round(500, { area }))
    expect(winners("One Careful Dab", [player("a", painting(100)), player("b", painting(10_000))])).toEqual([idOf("a")])
    expect(titles([player("a", painting(100)), player("b", painting(100))])).not.toContain("One Careful Dab")
  })

  it("Comeback Kid: climbing two places or more to finish", () => {
    const others = [
      player("b", [round(500), round(500), round(500), round(500)]),
      player("c", [round(400), round(400), round(400), round(400)])
    ]
    const kid = [player("a", [round(100), round(100), round(1000), round(1000)]), ...others]
    expect(earned(kid).find((award) => award.title === "Comeback Kid")).toMatchObject({
      playerIds: [idOf("a")],
      line: "{0} was 3rd after round 1 and finished 1st. Sickening."
    })
    const oneUp = [player("a", [round(450), round(450), round(1000), round(1000)]), ...others]
    expect(titles(oneUp)).not.toContain("Comeback Kid")
  })

  it("Bottled It: leading alone after a round, and not winning", () => {
    const b = player("b", [round(500), round(500), round(500)])
    expect(winners("Bottled It", [player("a", [round(900), round(100), round(100)]), b])).toEqual([idOf("a")])
    expect(titles([player("a", [round(500), round(100), round(100)]), b])).not.toContain("Bottled It")
  })

  it("Rollercoaster: 700 points or more between a player's best and worst", () => {
    expect(winners("Rollercoaster", [player("a", [round(100), round(900)]), player("b", AVERAGE)])).toEqual([idOf("a")])
    expect(titles([player("a", [round(150), round(840)]), player("b", AVERAGE)])).not.toContain("Rollercoaster")
  })

  it("Beige: four rounds or more, all alike", () => {
    const wild = player("b", [round(100), round(900), round(100), round(900)])
    expect(winners("Beige", [player("a", [round(500), round(520), round(480), round(500)]), wild])).toEqual([idOf("a")])
    expect(titles([player("a", [round(400), round(600), round(400), round(600)]), wild])).not.toContain("Beige")
  })

  it("On Fire: three rounds of 850 or more in a row", () => {
    const b = player("b", [round(500), round(500), round(500), round(500)])
    expect(winners("On Fire", [player("a", [round(900), round(900), round(900), round(500)]), b])).toEqual([idOf("a")])
    expect(titles([player("a", [round(900), round(900), round(500), round(900)]), b])).not.toContain("On Fire")
  })

  it("Wooden Spoon: last of three or more", () => {
    const three = [player("a", AVERAGE), player("b", AVERAGE), player("c", [round(100), round(100)])]
    expect(winners("Wooden Spoon", three)).toEqual([idOf("c")])
    expect(titles(three.slice(1))).not.toContain("Wooden Spoon")
  })

  it("So Near: second by no more than 3% of the winner's total", () => {
    expect(winners("So Near", [player("a", AVERAGE), player("b", [round(490), round(500)])])).toEqual([idOf("b")])
    expect(titles([player("a", AVERAGE), player("b", [round(460), round(500)])])).not.toContain("So Near")
  })

  it("Hive Mind: two players wrong in the same place twice or more", () => {
    const wrong = pointRound(300, point({ spot: { lat: 10, lon: 10 }, missCost: 400 }))
    expect(winners("Hive Mind", [player("a", [wrong, wrong]), player("b", [wrong, wrong])])).toEqual([
      idOf("a"),
      idOf("b")
    ])
    expect(titles([player("a", [wrong, wrong]), player("b", [wrong, round(300)])])).not.toContain("Hive Mind")
  })
})

describe("handing out the awards", () => {
  const fast = { lockedAfter: 10_000 }
  // Three prizes (Bullseye, On Fire, Fastest Finger) and two booby prizes (Chicken, Hedge Fund Manager).
  const showOff = player("a", [
    pointRound(970, point({ hedged: true }), fast),
    pointRound(960, point({ hedged: true }), fast),
    round(960, fast),
    pass(),
    pass()
  ])
  const plain = (letter: string) =>
    player(
      letter,
      Array.from({ length: 5 }, () => round(500))
    )

  it("gives two booby prizes to every real one", () => {
    for (const seed of SEEDS) {
      const awards = pickAwards([showOff], seed)
      expect(awards).toHaveLength(3)
      expect(awards.filter((award) => award.title === "Chicken" || award.title === "Hedge Fund Manager")).toHaveLength(
        2
      )
    }
  })

  it("gives one each before anyone gets a second", () => {
    const players = [
      player("a", [round(960, fast), round(960, fast), round(960, fast)]),
      player("b", [pass(), pass(), round(500)]),
      player("c", [round(300), round(300), round(300)])
    ]
    for (const seed of SEEDS)
      expect(new Set(pickAwards(players, seed).flatMap((award) => award.playerIds))).toEqual(
        new Set(["a", "b", "c"].map(idOf))
      )
  })

  it("hands out three to five, more with more players", () => {
    // The show-off's five, and a wooden spoon once there are three players: more than the cap each time.
    const crowd = (size: number) => [showOff, ...["b", "c", "d", "e", "f", "g", "h"].slice(0, size - 1).map(plain)]
    for (const [size, count] of [
      [1, 3],
      [2, 3],
      [4, 4],
      [8, 5]
    ] as const)
      expect(pickAwards(crowd(size), 1), `${size} players`).toHaveLength(count)
  })
})
