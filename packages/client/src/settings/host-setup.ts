/**
 * The host's last game setup, remembered in this browser so their next game
 * starts the same way. Saved only from the host's own choices in the lobby,
 * and applied only to a game this tab has just created.
 */
import { useEffect, useRef } from "preact/hooks"
import {
  ConfigureSchema,
  MAX_ROUNDS,
  mixOf,
  type ConfigurePatch,
  type QuestionMix
} from "@whereabouts/shared/protocol/config"
import { type GameView, Phase } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import type { GameService } from "../game-service/game-service"
import { hostSetup } from "./settings"

type HostSetupGame = Pick<GameService, "configure" | "online">

const FIELDS = Object.keys(ConfigureSchema.shape) as (keyof ConfigurePatch)[]

/**
 * The saved setup as a patch the server will accept. Each setting is checked
 * against the options the game offers today and dropped alone if it is no
 * longer one of them, since the server rejects a patch with any bad value.
 */
export const savedSetupPatch = (saved: unknown): ConfigurePatch => {
  const patch: Record<string, unknown> = {}
  if (typeof saved !== "object" || !saved) return patch
  const setup = { ...(saved as Record<string, unknown>) }
  setup["mix"] = setup["mix"] === undefined ? mixFromOldSetup(setup) : renamedMix(setup["mix"])
  // Saved in lower case before the map details were an enum.
  if (typeof setup["mapDetail"] === "string") setup["mapDetail"] = setup["mapDetail"].toUpperCase()
  for (const field of FIELDS) {
    const value = setup[field]
    if (value === undefined) continue
    const parsed = ConfigureSchema.shape[field].safeParse(value)
    if (parsed.success && parsed.data !== undefined) patch[field] = parsed.data
  }
  return patch
}

/** Change the game's setup as host, and remember it for the next game: only once sent, so the two agree. */
export const configureAsHost = (game: HostSetupGame, patch: ConfigurePatch): void => {
  if (!game.online.value) return
  game.configure(patch)
  hostSetup.value = { ...savedSetupPatch(hostSetup.value), ...patch }
}

/** A game this tab created, in its lobby, is the one to give the remembered setup. */
export const shouldApplySavedSetup = (created: boolean, view: GameView | undefined): boolean =>
  created && view?.phase === Phase.LOBBY && view.you.isHost

/** Once a game this tab created reaches its lobby, give it the remembered setup. */
export const useSavedSetup = (game: HostSetupGame, view: GameView | undefined, created: boolean): void => {
  const applied = useRef(false)
  const ready = shouldApplySavedSetup(created, view)
  useEffect(() => {
    if (!ready || applied.current) return
    applied.current = true
    const patch = savedSetupPatch(hostSetup.value)
    if (Object.keys(patch).length > 0) game.configure(patch)
  }, [ready])
}

/** The mix's keys before the question types were named as they are now. */
const OLD_MIX_KEYS: Record<string, QuestionType> = {
  landmarks: QuestionType.LANDMARK,
  places: QuestionType.PLACE,
  countries: QuestionType.COUNTRY,
  flags: QuestionType.FLAG,
  features: QuestionType.FEATURE,
  states: QuestionType.STATE
}

/** A mix saved under the old keys, under today's; any other left as it is. */
const renamedMix = (mix: unknown): unknown => {
  if (typeof mix !== "object" || !mix || !Object.keys(mix).some((key) => key in OLD_MIX_KEYS)) return mix
  return mixOf(
    Object.fromEntries(Object.entries(mix).map(([key, count]) => [OLD_MIX_KEYS[key] ?? key, count as number]))
  )
}

const OLD_PHOTO_SHARES = [1, 0.75, 0.5, 0.25, 0]
const OLD_SHARES: Record<string, number> = { off: 0, mixed: 0.25, only: 1 }

/**
 * A setup saved before the question mix, as a mix: the rounds, their share
 * of photos, and whole countries and flags as off, mixed in (a quarter) or
 * only, split as those games split them. Undefined when none were saved.
 */
const mixFromOldSetup = (setup: Record<string, unknown>): QuestionMix | undefined => {
  const { rounds, photoShare, countries, flags } = setup
  if ([rounds, photoShare, countries, flags].every((value) => value === undefined)) return undefined
  const roundCount =
    typeof rounds === "number" && Number.isInteger(rounds) && rounds >= 1 && rounds <= MAX_ROUNDS ? rounds : 8
  const photos = typeof photoShare === "number" && OLD_PHOTO_SHARES.includes(photoShare) ? photoShare : 0.5
  let countryShare = OLD_SHARES[String(countries)] ?? 0
  let flagShare = OLD_SHARES[String(flags)] ?? 0
  const sum = countryShare + flagShare
  if (sum > 1) {
    countryShare /= sum
    flagShare /= sum
  }
  const countryCount = Math.round(roundCount * countryShare)
  const flagCount = Math.min(Math.round(roundCount * flagShare), roundCount - countryCount)
  const named = roundCount - countryCount - flagCount
  const landmarks = Math.round(named * photos)
  return mixOf({
    [QuestionType.LANDMARK]: landmarks,
    [QuestionType.PLACE]: named - landmarks,
    [QuestionType.COUNTRY]: countryCount,
    [QuestionType.FLAG]: flagCount
  })
}
