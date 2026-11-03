import { describe, expect, it } from "vite-plus/test"
import { MapDetail, mixOf, type GameConfig } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { KernelId } from "@whereabouts/shared/scoring/scoring"
import { changedSetup, setupTiles, SetupTileType } from "./setup-tiles"

const config = (overrides: Partial<GameConfig> = {}): GameConfig => ({
  mix: mixOf({ [QuestionType.LANDMARK]: 3, [QuestionType.PLACE]: 2 }),
  roundLength: 60_000,
  hints: 1,
  mapDetail: MapDetail.MINIMAL,
  kernelId: KernelId.SINGLE,
  ...overrides
})

describe("setupTiles", () => {
  it("reads the rounds, seconds and hints", () => {
    expect(setupTiles(config()).map(({ value, label }) => `${value} ${label}`)).toEqual([
      "5 rounds",
      "60 s per round",
      "1 hint each"
    ])
  })

  it("uses the singular for one round", () => {
    expect(setupTiles(config({ mix: mixOf({ [QuestionType.FLAG]: 1 }) }))[0]).toMatchObject({
      value: "1",
      label: "round"
    })
  })

  it("says so when there is no time limit or no limit on hints", () => {
    expect(
      setupTiles(config({ roundLength: undefined, hints: undefined })).map(({ value, label }) => `${value} ${label}`)
    ).toEqual(["5 rounds", "No limit per round", "Unlimited hints each"])
  })

  it("pluralises none and many hints", () => {
    expect(setupTiles(config({ hints: 0 }))[2]).toMatchObject({ value: "0", label: "hints each" })
  })
})

describe("changedSetup", () => {
  it("is empty when nothing changed", () => {
    expect([...changedSetup(config(), config())]).toEqual([])
  })

  it("names only the value the host changed", () => {
    expect([...changedSetup(config(), config({ roundLength: 30_000 }))]).toEqual([SetupTileType.SECONDS])
    expect([...changedSetup(config(), config({ hints: 2 }))]).toEqual([SetupTileType.HINTS])
    expect([...changedSetup(config(), config({ mapDetail: MapDetail.WATER }))]).toEqual([SetupTileType.MAP_DETAIL])
  })

  it("marks the questions alone when the mix changes but not the rounds", () => {
    const swapped = config({ mix: mixOf({ [QuestionType.LANDMARK]: 2, [QuestionType.PLACE]: 3 }) })
    expect([...changedSetup(config(), swapped)]).toEqual([SetupTileType.QUESTIONS])
  })

  it("marks the rounds and the questions when a round is added", () => {
    const more = config({ mix: mixOf({ [QuestionType.LANDMARK]: 4, [QuestionType.PLACE]: 2 }) })
    expect(new Set(changedSetup(config(), more))).toEqual(new Set([SetupTileType.ROUNDS, SetupTileType.QUESTIONS]))
  })
})
