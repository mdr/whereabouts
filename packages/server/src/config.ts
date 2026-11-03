/** Server settings from the environment, kept pure so they can be tested. */
import { KernelIdSchema, type KernelId } from "@whereabouts/shared/scoring/scoring"
import { evenMix, type GameConfig } from "@whereabouts/shared/protocol/config"
import type { AddressLimits } from "./address-limiter.ts"

export interface ServerConfig {
  port: number
  host: string
  /** Directory of built client files, or undefined to serve the API only. */
  staticDir: string | undefined
  game: Partial<GameConfig>
  /** Undefined for the limiter's defaults. */
  addressLimits: AddressLimits | undefined
  /** Playtest endpoints, for development servers only. */
  devTools: boolean
}

export const configFromEnv = (env: Record<string, string | undefined>, defaultStaticDir: string): ServerConfig => {
  const game: Partial<GameConfig> = {}
  const rounds = positiveInt(env["ROUNDS"])
  const roundLength = positiveInt(env["ROUND_MS"])
  if (rounds !== undefined) game.mix = evenMix(rounds)
  if (roundLength !== undefined) game.roundLength = roundLength
  if (env["KERNEL"]) game.kernelId = kernelId(env["KERNEL"])
  // Browser tests reach the server through Vite's proxy, all from one address.
  const perAddress = positiveInt(env["CONNECTIONS_PER_ADDRESS"])
  return {
    port: positiveInt(env["PORT"]) ?? 8787,
    host: env["HOST"] ?? "0.0.0.0",
    staticDir: env["STATIC_DIR"] === "" ? undefined : (env["STATIC_DIR"] ?? defaultStaticDir),
    game,
    addressLimits:
      perAddress === undefined ? undefined : { maxOpen: perAddress, burst: perAddress, perSecond: perAddress },
    devTools: env["DEV_TOOLS"] === "1"
  }
}

/** A typo here would otherwise score every game with the default kernel unnoticed. */
const kernelId = (name: string): KernelId => {
  // Also the old names, written in lower case with hyphens.
  const parsed = KernelIdSchema.safeParse(name.toUpperCase().replaceAll("-", "_"))
  if (!parsed.success) throw new Error(`KERNEL must be one of ${KernelIdSchema.options.join(", ")}, not "${name}"`)
  return parsed.data
}

const positiveInt = (text: string | undefined): number | undefined => {
  if (text === undefined || text === "") return undefined
  const parsed = Number(text)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
