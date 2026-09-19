import { existsSync } from "node:fs";
import { createApp, defaultStaticDir } from "./app.ts";

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
