/** Server settings from the environment, kept pure so they can be tested. */
import { KernelIdSchema, type GameConfig } from "@whereabouts/shared"

export interface ServerConfig {
  port: number
  host: string
  /** Directory of built client files, or undefined to serve the API only. */
  staticDir: string | undefined
  game: Partial<GameConfig>
}

export function configFromEnv(env: Record<string, string | undefined>, defaultStaticDir: string): ServerConfig {
  const game: Partial<GameConfig> = {}
  const rounds = positiveInt(env.ROUNDS)
  const roundMs = positiveInt(env.ROUND_MS)
  if (rounds !== undefined) game.rounds = rounds
  if (roundMs !== undefined) game.roundMs = roundMs
  if (env.KERNEL) game.kernelId = kernelId(env.KERNEL)
  return {
    port: positiveInt(env.PORT) ?? 8787,
    host: env.HOST ?? "0.0.0.0",
    staticDir: env.STATIC_DIR === "" ? undefined : (env.STATIC_DIR ?? defaultStaticDir),
    game
  }
}

/** A typo here would otherwise score every game with the default kernel unnoticed. */
function kernelId(v: string) {
  const parsed = KernelIdSchema.safeParse(v)
  if (!parsed.success) throw new Error(`KERNEL must be one of ${KernelIdSchema.options.join(", ")}, not "${v}"`)
  return parsed.data
}

function positiveInt(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}
