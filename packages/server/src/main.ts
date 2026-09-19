import { existsSync } from "node:fs";
import { createApp, defaultStaticDir } from "./app.ts";
import { configureGameRooms } from "./rooms.ts";

// Optional overrides, handy for playtesting: ROUNDS, ROUND_MS, REVEAL_MS, KERNEL.
const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
configureGameRooms({
  config: {
    ...(num(process.env.ROUNDS) !== undefined ? { rounds: num(process.env.ROUNDS)! } : {}),
    ...(num(process.env.ROUND_MS) !== undefined ? { roundMs: num(process.env.ROUND_MS)! } : {}),
    ...(num(process.env.REVEAL_MS) !== undefined ? { revealMs: num(process.env.REVEAL_MS)! } : {}),
    ...(process.env.KERNEL ? { kernelId: process.env.KERNEL } : {}),
  },
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const staticDir = process.env.STATIC_DIR ?? defaultStaticDir();

const app = createApp({
  staticDir: existsSync(staticDir) ? staticDir : null,
  logger: true,
});

const address = await app.listen(port, host);
app.fastify.log.info(`whereabouts server on ${address} (static: ${existsSync(staticDir) ? staticDir : "none"})`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
