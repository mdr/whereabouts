/** Server settings from the environment, kept pure so they can be tested. */
import type { GameConfig } from "@whereabouts/shared";

export interface ServerConfig {
  port: number;
  host: string;
  /** Directory of built client files, or null to serve the API only. */
  staticDir: string | null;
  game: Partial<GameConfig>;
}

export function configFromEnv(env: Record<string, string | undefined>, defaultStaticDir: string): ServerConfig {
  const game: Partial<GameConfig> = {};
  const rounds = positiveInt(env.ROUNDS);
  const roundMs = positiveInt(env.ROUND_MS);
  const revealMs = positiveInt(env.REVEAL_MS);
  if (rounds !== undefined) game.rounds = rounds;
  if (roundMs !== undefined) game.roundMs = roundMs;
  if (revealMs !== undefined) game.revealMs = revealMs;
  if (env.KERNEL) game.kernelId = env.KERNEL;
  return {
    port: positiveInt(env.PORT) ?? 8787,
    host: env.HOST ?? "0.0.0.0",
    staticDir: env.STATIC_DIR === "" ? null : (env.STATIC_DIR ?? defaultStaticDir),
    game,
  };
}

function positiveInt(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
